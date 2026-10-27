import { BehindTheNameClient, toDocumentInput } from '../dist/index.js';
try{
 const apiKey=process.env.BEHINDTHENAME_API_KEY;if(!apiKey)throw Error('configuration');
 const client=new BehindTheNameClient({apiKey});
 const lookup=await client.lookup('John',{exact:true});const related=await client.related('John',{usage:'eng'});
 toDocumentInput(lookup);toDocumentInput(related);
 console.log(JSON.stringify({live:true,lookupMatches:lookup.data.length,relatedCandidates:related.data.names.length,evidenceValidated:true}));
}catch{console.error('Live validation failed. Set BEHINDTHENAME_API_KEY and check provider access and quota. No credential or provider response was printed.');process.exitCode=1;}
