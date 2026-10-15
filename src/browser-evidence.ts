import { chacha20poly1305 } from '@noble/ciphers/chacha';
import type { VerificationRequest, BrowserProtection } from './types';
import { Transport, BastionError } from './transport';
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encode=(b:Uint8Array)=>{let binary='';for(let i=0;i<b.length;i+=32768)binary+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
export async function browserPolicy(transport:Transport):Promise<BrowserProtection> {
  try { return await transport.post<BrowserProtection>('/browser/config',{}); }
  catch(error) {
    // Old API deployments have no optional evidence layer; preserve compatibility.
    if(error instanceof BastionError && error.status===404)return {mode:'off',telemetry:false,interactions:false,encryptedExchange:false,events:['signup']};
    throw error;
  }
}
export function applies(policy:BrowserProtection,event:string) {
  return ['monitor','enforce'].includes(policy.mode)&&(policy.telemetry||policy.interactions||policy.encryptedExchange)&&policy.events.includes(event);
}
export async function browserReceipt(transport:Transport,request:VerificationRequest):Promise<string> {
  const session=await transport.post<any>('/browser/start',{context:request.context,idempotency_key:request.idempotency_key});
  let exchange:any={id:session.id,idempotency_key:request.idempotency_key};
  if(session.encrypted){
    if(!crypto.subtle)throw new BastionError('Encrypted browser evidence requires HTTPS and Web Crypto.');
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    const peer=await crypto.subtle.importKey('raw',decode(session.public_key) as BufferSource,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const secret=await crypto.subtle.deriveBits({name:'ECDH',public:peer},pair.privateKey,256);
    const material=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveBits']);
    const info=new TextEncoder().encode(session.info),salt=decode(session.salt);
    const key=new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:salt as BufferSource,info},material,256));
    const nonce=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=chacha20poly1305(key,nonce,info).encrypt(new TextEncoder().encode(JSON.stringify(request)));
    key.fill(0);
    exchange={...exchange,public_key:encode(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey))),nonce:encode(nonce),ciphertext:encode(ciphertext)};
  }else exchange.payload=request;
  const result=await transport.post<{browser_receipt:string}>('/browser/exchange',exchange);
  if(!result.browser_receipt)throw new BastionError('Browser evidence receipt was not returned. Retry verification.');
  return result.browser_receipt;
}
