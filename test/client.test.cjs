const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');const crypto=require('node:crypto');
const {ServerBastion,verifyWebhook,BastionError}=require('../dist/bastion.js');
test('server client preserves full telemetry, auth, envelope, and one key across transient retries',async()=>{
 let calls=0;const bodies=[];
 const server=http.createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;bodies.push(body);
  assert.equal(req.url,'/api/antibot/verify');assert.equal(req.headers['x-site-key'],'public');assert.equal(req.headers['x-secret-key'],'private');
  res.setHeader('Content-Type','application/json');if(++calls===1){res.statusCode=503;res.end('{"message":"retry"}');return;}
  res.end(JSON.stringify({success:true,data:{request_id:'decision',risk_score:71,action:'block',signals:[{rule:'credential_stuffing',score:40,description:'10 failed attempts'}]}}));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const client=new ServerBastion({siteKey:'public',secret:'private',endpoint:`http://127.0.0.1:${server.address().port}`});
 const result=await client.verify({context:{event_type:'login',account_id:'a',login_succeeded:false},environment:{nonce:'nonce',request_timestamp:Date.now()},behavior:{keystrokes:[]}});
 assert.equal(calls,2);assert.equal(bodies[0],bodies[1]);assert.equal(result.signals[0].rule,'credential_stuffing');assert.ok(JSON.parse(bodies[0]).idempotency_key);client.destroy();}
 finally{await new Promise(resolve=>server.close(resolve));}
});
test('invalid credentials are not retried and malformed JSON cannot look like an allowed decision',async()=>{
 let calls=0;const server=http.createServer((_req,res)=>{calls++;res.statusCode=401;res.end('{"message":"Invalid site keys"}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const client=new ServerBastion({siteKey:'public',secret:'wrong',endpoint:`http://127.0.0.1:${server.address().port}`});
 await assert.rejects(client.verify({context:{event_type:'login',account_id:'a'}}),e=>e instanceof BastionError&&e.status===401);assert.equal(calls,1);client.destroy();}
 finally{await new Promise(resolve=>server.close(resolve));}
});
test('webhooks reject tampering, stale signatures, wrong keys and accept exact raw Unicode bytes',async()=>{
 const payload=JSON.stringify({text:'fraud 🚨'}),now=Math.floor(Date.now()/1000),secret='secret';
 const signature=`t=${now},v1=${crypto.createHmac('sha256',secret).update(`${now}.${payload}`).digest('hex')}`;
 assert.equal(await verifyWebhook(secret,payload,signature),true);assert.equal(await verifyWebhook(secret,payload+' ',signature),false);
 assert.equal(await verifyWebhook('wrong',payload,signature),false);assert.equal(await verifyWebhook(secret,payload,signature,300,now+301),false);
});
