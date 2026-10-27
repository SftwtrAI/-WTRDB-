import { mintToken } from "./src/auth/v2auth.js";
import { config } from "./src/config.js";
import { pool } from "./src/db.js";
import { falkorQuery, getGraphName } from "./src/falkor.js";
const kb = process.env.KB!;
const P=(ok:boolean,m:string)=>console.log(`${ok?"PASS":"FAIL"}  ${m}`);
(async()=>{
  const token = mintToken(config.defaultUserId);
  const res = await fetch(`${config.v2BaseUrl}/api/knowledge-graph/${kb}/events/replay`,{headers:{Authorization:`Bearer ${token}`}});
  const evs:any[] = (await res.json()).events||[];
  const ent = evs.filter(e=>e.eventType==="entity_discovered");
  const rel = evs.filter(e=>e.eventType==="relationship_extracted");
  // 1. stable ids
  P(evs.every(e=>typeof e.id==="string" && e.id.startsWith(kb)), `all ${evs.length} events have stable kb-prefixed id`);
  // 2. relationship names present
  const badRel = rel.filter(r=>!r.sourceEntity||!r.targetEntity);
  P(badRel.length===0, `all ${rel.length} relationships carry source+target NAMES (bad=${badRel.length})`);
  // 3. no duplicate entity IDS (collision fix)
  const ids = ent.map(e=>e.entityId);
  const uniq = new Set(ids);
  P(uniq.size===ids.length, `entity ids unique: ${uniq.size}/${ids.length} (no o_/l_ collisions)`);
  console.log("   sample ids:", ids.slice(0,8).join(", "));
  // 4. NEXT_EVENT order matches persisted timestamp order
  const g = getGraphName(config.defaultUserId, kb);
  const evNodes = (await falkorQuery(g, `MATCH (e:Event) RETURN e.name AS name, e.timestampStartSec AS t ORDER BY e.timestampStartSec`)).records.map((r:any)=>r.name);
  const nextRel = rel.filter(r=>r.relationshipType==="NEXT_EVENT");
  // build live chain names via id->name map from entity events
  const nameById:Record<string,string> = {}; for(const e of ent) nameById[e.entityId]=e.entityName;
  const liveChainOk = nextRel.every(r=> nameById[r.sourceEntityId] && nameById[r.targetEntityId]);
  // check each NEXT_EVENT goes start->later by matching persisted order index
  const idx:Record<string,number>={}; evNodes.forEach((n:string,i:number)=>idx[n]=i);
  const monotonic = nextRel.every(r=> (idx[nameById[r.sourceEntityId]]??-1) < (idx[nameById[r.targetEntityId]]??1e9));
  P(liveChainOk && monotonic, `NEXT_EVENT chain is temporally monotonic (matches sorted persisted events)`);
  // 5. FalkorDB counts == metadata counts
  const nodes = Number((await falkorQuery(g, `MATCH (n) RETURN count(n) AS c`)).records[0]?.c ?? -1);
  const edges = Number((await falkorQuery(g, `MATCH ()-[r]->() RETURN count(r) AS c`)).records[0]?.c ?? -1);
  const md = (await pool.query(`SELECT status, entity_count, relationship_count FROM knowledge_graphs WHERE knowledge_base_id=$1`,[kb])).rows[0];
  P(md?.status==="completed", `status=completed (${md?.status})`);
  P(nodes===Number(md?.entity_count), `FalkorDB nodes(${nodes}) == metadata entity_count(${md?.entity_count})`);
  P(edges===Number(md?.relationship_count), `FalkorDB edges(${edges}) == metadata relationship_count(${md?.relationship_count})`);
  await pool.end();
})();
