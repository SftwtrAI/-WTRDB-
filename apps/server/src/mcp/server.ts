import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import { pool } from "../db";
import { emailService } from "../services/email-service";
import { z } from "zod";
import { RoomServiceClient } from 'livekit-server-sdk';
import { credentialService } from '../engines/livekit/services/credential.service';
import { logger } from "../utils/logger";

function createMcpServer(): McpServer {
    // Initialize MCP Server
    const mcpServer = new McpServer({
        name: "wtrops-server",
        version: "1.0.0",
    });

    // Example Tool: Get System Status
    mcpServer.tool(
        "get_system_status",
        {},
        async () => {
            return {
                content: [{ type: "text", text: "System is operational. Database connected." }],
            };
        }
    );

    // Tool: List Active LiveKit Rooms
    mcpServer.tool(
        "list_active_rooms",
        {},
        async () => {
            try {
                const credential = await credentialService.getFirstActiveCredential();
                if (!credential) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "No active LiveKit credentials found." }],
                    };
                }

                const roomService = new RoomServiceClient(
                    credential.livekitUrl,
                    credential.livekitApiKey,
                    credential.livekitApiSecret,
                );

                const rooms = await roomService.listRooms();
                return {
                    content: [{ type: "text", text: JSON.stringify(rooms, null, 2) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `LiveKit error: ${error.message}` }],
                };
            }
        }
    );

    // Tool: Get Active Participant Count
    mcpServer.tool(
        "get_active_participants",
        { roomName: z.string().describe("The name of the room to check") },
        async ({ roomName }) => {
            try {
                const credential = await credentialService.getFirstActiveCredential();
                if (!credential) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "No active LiveKit credentials found." }],
                    };
                }

                const roomService = new RoomServiceClient(
                    credential.livekitUrl,
                    credential.livekitApiKey,
                    credential.livekitApiSecret,
                );

                const participants = await roomService.listParticipants(roomName);
                return {
                    content: [{ type: "text", text: `There are ${participants.length} participants in room ${roomName}.` }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `LiveKit error: ${error.message}` }],
                };
            }
        }
    );

    // Tool: Query Database (Read-Only Safety Check Recommended in Production)
    mcpServer.tool(
        "query_database",
        { sql: z.string().describe("The SQL query to execute") },
        async ({ sql }) => {
            try {
                const result = await pool.query(sql);
                return {
                    content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }],
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Database error: ${error.message}` }],
                };
            }
        }
    );

    // Tool: Send Email
    mcpServer.tool(
        "send_email",
        "Send an email to the user. DO NOT call this tool until you have gathered all required information: 1) the recipient's full email address, 2) the subject of the email, AND 3) what they want written in the body of the email. You must ask the user for the subject and body before calling this. If you do not have the subject and body, ask the user for them. STT often mishears email usernames (e.g. devasye instead of vasu), so pay close attention to the spelling.",
        {
            to: z.string().describe("Recipient email address. STT often gets the part before the @ wrong. Ensure this is exactly what the user spelled."),
            subject: z.string().describe("Email subject. You MUST ask the caller what the subject should be before invoking this tool."),
            html: z.string().describe("HTML body of the email. You MUST ask the caller what should be written in the email before invoking this tool."),
            isConfirmed: z.boolean().describe("Set to true ONLY AFTER explicitly asking the user to confirm the spelling of their email address letter by letter (e.g. 'Is v-a-s-u at sftwtrs.ai correct?')."),
        },
        async ({ to, subject, html, isConfirmed }) => {
            try {
                if (!isConfirmed) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: "You must confirm the exact spelling of the full email address with the user first. Ask them 'Is that exact spelling correct?' and set isConfirmed to true before calling this tool." }],
                    };
                }

                // Explicit email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(to)) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Invalid email format: ${to}. Please ask the user for a valid email containing an '@' symbol and a domain name.` }],
                    };
                }

                // Correct common STT typos for the company domain
                const correctedTo = to.replace(/@(fftwtrs|sfbwtrs|sftwaters|softwaters|sftwtrs|sftwrts)\.ai$/i, '@sftwtrs.ai');

                // Use the email service to send the email
                const result = await emailService.sendEmail(correctedTo, subject, html);
                if (result.success) {
                    return {
                        content: [{ type: "text", text: `Email sent successfully to ${correctedTo} (Message ID: ${result.messageId})` }],
                    };
                } else {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Failed to send email: ${result.error}` }],
                    };
                }
            } catch (error: any) {
                // Check if it's a Zod error for better conversational feedback
                if (error?.issues && error.issues[0]?.message) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Validation error: ${error.issues[0].message}. Please ask the user to provide the correct information and try again.` }],
                    };
                }
                return {
                    isError: true,
                    content: [{ type: "text", text: `Email service error: ${error.message}` }],
                };
            }
        }
    );

    return mcpServer;
}

// Register MCP Routes
export async function registerMcpRoutes(app: express.Application) {
    const sseSessions = new Map<string, SSEServerTransport>();

    app.get("/mcp/sse", async (req: Request, res: Response) => {
        console.log("New MCP SSE connection");
        const transport = new SSEServerTransport("/mcp/messages", res);

        // Use a persistent connection ID for logging
        const sessionId = transport.sessionId;
        sseSessions.set(sessionId, transport);

        transport.onclose = () => {
            sseSessions.delete(sessionId);
        };

        const mcpServer = createMcpServer(); // Create a new server instance for each connection
        try {
            await mcpServer.connect(transport);
        } catch (error: any) {
            logger.error(`[MCP] Failed to connect SSE transport: ${error.message}`, error, 'McpServer');
        }
    });

    app.post("/mcp/messages", async (req: Request, res: Response) => {
        const sessionId = req.query.sessionId as string;
        logger.info(`[MCP] Message received for session: ${sessionId}, body type: ${typeof req.body}, keys: ${Object.keys(req.body || {}).join(',')}`, undefined, 'McpServer');
        if (!sessionId) {
            return res.status(400).send("Session ID required");
        }

        const transport = sseSessions.get(sessionId);
        if (transport) {
            // Pass req.body as the parsed body since global express.json() already read the stream
            await transport.handlePostMessage(req, res, req.body);
        } else {
            res.status(404).send("Session not found");
        }
    });
}
