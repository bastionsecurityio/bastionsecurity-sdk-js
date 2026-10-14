const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');const {ServerBastion,BastionError,verifyWebhook}=require('../dist/bastion.js');
async function main(){
 const c=JSON.parse(fs.readFileSync(process.env.BASTION_QA_SESSION||'/tmp/bastion-sdk-qa-session.json'));
 if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(c.endpoint))throw new Error('Local QA only');
 const client=new ServerBastion({siteKey:c.site_key,secret:c.secret,endpoint:c.endpoint});
 const fp=await client.fingerprint({canvas_hash:'js-sdk-e2e',platform:'MacIntel',user_agent:'Mozilla/5.0 Chrome/130.0',language:'en-US',languages:['en-US'],screen_resolution:'1440x900'});assert.ok(fp.token);assert.ok(fp.expires_at);
 const request={token:fp.token,context:{event_type:'login',account_id:'js-sdk-e2e',login_succeeded:false},environment:{nonce:crypto.randomUUID(),request_timestamp:Date.now()},idempotency_key:crypto.randomUUID()};
 const decision=await client.verify(request),again=await client.verify(request);assert.equal(decision.request_id,again.request_id);assert.ok(Array.isArray(decision.signals));assert.ok(Number.isFinite(decision.risk_score));
 assert.ok((await client.classify(fp.token,{event_type:'signup',account_id:'js-sdk-classify'})).request_id);
 assert.ok((await client.track('checkout',{account_id:'js-sdk-track',order_amount:4,payment_hash:'js-test-card'},fp.token)).request_id);
 const batch=await client.batch([{...request,idempotency_key:crypto.randomUUID(),environment:undefined},{context:{event_type:'unsupported',account_id:'invalid'}}]);assert.equal(batch.accepted,1);assert.equal(batch.results[1].status,400);
 const bad=new ServerBastion({siteKey:c.site_key,secret:'wrong',endpoint:c.endpoint});await assert.rejects(bad.verify(request),e=>e instanceof BastionError&&e.status===401);bad.destroy();
 const challenge=await client.createChallenge(4);let nonce=0;while(!crypto.createHash('sha256').update(challenge.prefix+nonce.toString(36)).digest('hex').startsWith('0'.repeat(challenge.difficulty)))nonce++;
 assert.equal((await client.verifyChallenge(challenge.challenge_id,nonce.toString(36))).valid,true);
 await assert.rejects(client.verifyChallenge(challenge.challenge_id,nonce.toString(36)),e=>e.status===400);
 client.destroy();console.log('PASS: JavaScript SDK real fingerprint, full scoring, deduplication, classify/track, partial batch, auth failure, proof verification and replay rejection.');
}main().catch(e=>{console.error(e);process.exitCode=1});
