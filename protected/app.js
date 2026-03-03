var API=location.origin,D={},bPg=1,tPg=1,userAddr=null;
var SESSION=new URLSearchParams(location.search).get("session")||sessionStorage.getItem("sling402_session")||(function(){var c=document.cookie.split(";");for(var i=0;i<c.length;i++){var p=c[i].trim();if(p.indexOf("session=")===0)return p.substring(8)}return ""})();
if(SESSION)sessionStorage.setItem("sling402_session",SESSION);
var AUTH_HEADERS={"X-Session":SESSION};

async function fj(u){var r=await fetch(API+u,{headers:AUTH_HEADERS});if(r.status===401){location.href="/";return{}}if(!r.ok)throw new Error(r.statusText);return r.json()}
function sh(s,n){n=n||8;return s?(s.slice(0,n)+"\u2026"+s.slice(-4)):""}
function R(k,v){return'<div class="k">'+k+'</div><div class="v">'+v+'</div>'}
function ta(ts){var s=Math.floor(Date.now()/1000)-ts;if(s<60)return s+"s";if(s<3600)return Math.floor(s/60)+"m";if(s<86400)return Math.floor(s/3600)+"h";return Math.floor(s/86400)+"d"}
function cp(t){navigator.clipboard.writeText(t)}

function nav(p){
  document.querySelectorAll(".pg").forEach(function(e){e.classList.remove("a")});
  document.querySelectorAll(".nb").forEach(function(e){e.classList.remove("a")});
  var el=document.getElementById("p-"+p);if(el)el.classList.add("a");
  var btn=document.querySelector('.nb[data-p="'+p+'"]');if(btn)btn.classList.add("a");
  var titles={"explorer":"Explorer","tokens":"Tokens","faucet":"Faucet","agents":"Payment Agents","programs":"Programs","convert":"Convert","tokenomics":"Supply","guide":"X402 Guide","tx":"Transaction","addr":"Account","block":"Block"};
  var pt=document.getElementById("pageTitle");if(pt)pt.textContent=titles[p]||p;
  if(typeof closeSidebar==="function")closeSidebar();
}

document.querySelectorAll(".nb[data-p]").forEach(function(b){
  b.addEventListener("click",function(){
    var p=b.dataset.p;nav(p);
    if(p==="faucet")lFS();if(p==="tokens")lTokens();if(p==="programs")lProgs();
    if(p==="agents")lAgents();if(p==="mining")loadMiningStats();
    if(p==="tokenomics")lTokenomics();if(p==="explorer"){lB(1);lT(1)}
    
  });
});

async function lStats(){
  D=await fj("/api/chain");
  document.getElementById("sSlot").textContent=D.slot?D.slot.toLocaleString():"0";
  document.getElementById("sTPS").textContent="~"+D.tps;
  document.getElementById("sTxns").textContent=D.totalTransactions?D.totalTransactions.toLocaleString():"0";
  document.getElementById("sTok").textContent=D.tokensCreated;
  document.getElementById("sAg").textContent=D.activeAgents||0;
}

async function lB(pg){
  bPg=pg||bPg;var r=await fj("/api/blocks?page="+bPg+"&limit=10");
  document.getElementById("bBody").innerHTML=(r.blocks||[]).map(function(b){
    return '<tr><td><span class="hl" onclick="vBk('+b.slot+')">'+b.slot.toLocaleString()+'</span></td><td style="color:var(--t3)">'+ta(b.blockTime)+' ago</td><td>'+b.txCount+'</td><td style="color:var(--t4);font-size:9px" class="m">'+sh(b.blockhash,10)+'</td></tr>';
  }).join("");
  var tp=r.totalPages||1;
  document.getElementById("pgB").innerHTML='<button onclick="lB('+(bPg-1)+')" '+(bPg<=1?"disabled":"")+'>&#8249;</button><span class="cur">'+bPg+'</span><button onclick="lB('+(bPg+1)+')" '+(bPg>=tp?"disabled":"")+'>&#8250;</button>';
}

async function lT(pg){
  tPg=pg||tPg;var r=await fj("/api/transactions?page="+tPg+"&limit=10");
  document.getElementById("tBody").innerHTML=(r.transactions||[]).map(function(tx){
    var tp=tx.type||"transfer";
    var badge=tp.indexOf("launch")>=0?'<span class="bd bk">LAUNCH</span>':
      tp.indexOf("faucet")>=0?'<span class="bd bt">FAUCET</span>':
      tp.indexOf("dex")>=0?'<span class="bd bc2">DEX</span>':
      tp.indexOf("memo")>=0?'<span class="bd ba">MEMO</span>':
      tp.indexOf("mining")>=0?'<span class="bd" style="background:rgba(245,158,11,.12);color:#f59e0b">MINE</span>':
      '<span class="bd be">\u2197</span>';
    return '<tr><td><span class="hl" onclick="vTx(\''+tx.signature+'\')">'+sh(tx.signature,10)+'</span></td><td>'+badge+'</td><td><span class="al" onclick="vAd(\''+tx.from+'\')">'+sh(tx.from)+'</span></td><td class="m" style="color:var(--acc)">'+(tx.amount?tx.amount.toFixed(1):"\u2014")+'</td></tr>';
  }).join("");
  var tp2=r.totalPages||1;
  document.getElementById("pgT").innerHTML='<button onclick="lT('+(tPg-1)+')" '+(tPg<=1?"disabled":"")+'>&#8249;</button><span class="cur">'+tPg+'</span><button onclick="lT('+(tPg+1)+')" '+(tPg>=tp2||tPg>=100?"disabled":"")+'>&#8250;</button>';
}

async function vTx(sig){
  nav("tx");var tx=await fj("/api/tx/"+sig);
  var badge=tx.status==="Success"?'<span class="bd bo">OK</span>':'<span class="bd bf">FAIL</span>';
  var t=tx.type||"";
  var typeBadge=t.indexOf("launch")>=0?'<span class="bd bk">Launch</span>':t.indexOf("faucet")>=0?'<span class="bd bt">Faucet</span>':t.indexOf("dex")>=0?'<span class="bd bc2">DEX</span>':t.indexOf("memo")>=0?'<span class="bd ba">Memo</span>':'<span class="bd be">'+tx.type+'</span>';
  document.getElementById("txD").innerHTML=
    R("Signature",tx.signature+' <button class="cp2" onclick="cp(\''+tx.signature+'\')">Copy</button>')+
    R("Status",badge+" "+typeBadge)+
    R("Slot",'<span class="hl" onclick="vBk('+tx.slot+')">'+tx.slot.toLocaleString()+'</span> <span class="bd be">'+tx.confirmations+' conf</span>')+
    R("Timestamp",new Date(tx.blockTime*1000).toLocaleString()+" ("+ta(tx.blockTime)+" ago)")+
    R("Fee",tx.fee+" lamports")+
    R("Compute",(tx.computeUnits||0).toLocaleString()+" / 200,000 CU")+
    '<div class="k" style="grid-column:1/-1;height:1px;background:var(--b1);padding:0"></div><div class="v" style="grid-column:1/-1;height:1px;background:var(--b1);padding:0"></div>'+
    R("From",'<span class="al" onclick="vAd(\''+tx.from+'\')">'+tx.from+'</span> <button class="cp2" onclick="cp(\''+tx.from+'\')">Copy</button>')+
    R("To",tx.to?'<span class="al" onclick="vAd(\''+tx.to+'\')">'+tx.to+'</span>':"\u2014")+
    R("Amount",tx.amount?'<span style="color:var(--acc);font-weight:700">\u25CE '+tx.amount+' S402</span>':"\u2014")+
    R("Program",'<span class="al" onclick="vAd(\''+tx.programId+'\')">'+sh(tx.programId,20)+'</span>')+
    (tx.memo?R("Memo",'<div class="decode">'+tx.memo+'</div>'):"")+
    R("Accounts",(tx.accounts||[]).map(function(a){return'<span class="al" onclick="vAd(\''+a+'\')">'+sh(a)+'</span>'}).join(" \u2192 "));
  if(tx.logMessages&&tx.logMessages.length){
    document.getElementById("txLogs").style.display="block";
    document.getElementById("txLogBody").innerHTML=tx.logMessages.map(function(l){
      return'<div style="'+(l.indexOf("success")>=0?"color:var(--acc)":l.indexOf("consumed")>=0?"color:var(--red)":"")+'">'+l+'</div>';
    }).join("");
  }else document.getElementById("txLogs").style.display="none";
}

async function vAd(pk){
  nav("addr");var d=await fj("/api/account/"+pk);
  var tb=d.isTreasury?'<span class="bd" style="background:rgba(0,230,118,.12);color:var(--acc)">[T] '+d.treasuryName+'</span>':
    d.executable?'<span class="bd bc2">PROGRAM'+(d.programName?" \u00B7 "+d.programName:"")+'</span>':
    (d.isAgent?'<span class="bd ba">[@] '+d.agentName+'</span>':'<span class="bd be">WALLET</span>');
  var hold="";
  if(d.tokenHoldings&&d.tokenHoldings.length){
    hold=R("Holdings",d.tokenHoldings.map(function(t){return'<span class="bd bt" style="margin:2px">'+t.logo+" $"+t.symbol+": "+t.balance.toLocaleString()+'</span>'}).join(" "));
  }
  var bdgs="";
  if(d.badges&&d.badges.length){
    bdgs=R("Badges",d.badges.map(function(b){return'<span class="bd" style="background:'+b.color+'22;color:'+b.color+';margin:2px" title="'+b.desc+'">'+b.label+'</span>'}).join(" "));
  }
  document.getElementById("aD").innerHTML=
    R("Address",d.pubkey+' <button class="cp2" onclick="cp(\''+d.pubkey+'\')">Copy</button>')+
    R("Type",tb)+bdgs+
    R("Balance",'<span style="color:var(--acc);font-weight:700">\u25CE '+d.balance+' S402</span> <span style="color:var(--t4);font-size:9px">('+d.lamports.toLocaleString()+' lamports)</span>')+
    R("Owner",'<span class="al" onclick="vAd(\''+d.owner+'\')">'+sh(d.owner,20)+'</span>')+
    R("Transactions",d.totalTransactions+" total")+hold;
  var tc=document.getElementById("aTxC");
  if(d.transactions&&d.transactions.length){
    tc.style.display="block";
    document.getElementById("aTx").innerHTML=d.transactions.map(function(tx){
      var dir=tx.from===pk?'<span class="bd bf" style="font-size:8px">OUT</span>':'<span class="bd bo" style="font-size:8px">IN</span>';
      return'<tr><td><span class="hl" onclick="vTx(\''+tx.signature+'\')">'+sh(tx.signature,10)+'</span></td><td><span class="bd ba">'+(tx.type||"tx")+'</span></td><td><span class="al" onclick="vAd(\''+tx.from+'\')">'+sh(tx.from)+'</span></td><td>'+dir+'</td><td>'+(tx.to?'<span class="al" onclick="vAd(\''+tx.to+'\')">'+sh(tx.to)+'</span>':"\u2014")+'</td><td class="m">'+(tx.amount||0)+'</td></tr>';
    }).join("");
  }else tc.style.display="none";
}

async function vBk(s){
  nav("block");var d=await fj("/api/block/"+s);
  document.getElementById("bD").innerHTML=
    R("Slot",d.slot?d.slot.toLocaleString():"")+R("Timestamp",new Date(d.blockTime*1000).toLocaleString())+
    R("Transactions",d.txCount)+R("Leader",'<span class="al" onclick="vAd(\''+d.leader+'\')">'+d.leader+'</span>')+
    R("Blockhash",'<span style="font-size:10px">'+d.blockhash+'</span>')+R("Parent",d.parentSlot);
  if(d.transactions&&d.transactions.length){
    document.getElementById("bTxC").style.display="block";
    document.getElementById("bTx").innerHTML=d.transactions.map(function(tx){
      return'<tr><td><span class="hl" onclick="vTx(\''+tx.signature+'\')">'+sh(tx.signature,14)+'</span></td><td><span class="bd ba">'+(tx.type||"tx")+'</span></td><td><span class="al" onclick="vAd(\''+tx.from+'\')">'+sh(tx.from)+'</span></td><td class="m" style="color:var(--acc)">'+(tx.amount||0)+'</td></tr>';
    }).join("");
  }else document.getElementById("bTxC").style.display="none";
}

async function lFS(){var s=await fj("/api/faucet/status");document.getElementById("fBl").textContent=Math.floor(s.balance).toLocaleString();document.getElementById("fCl").textContent=s.totalClaims+"/"+s.maxClaims}

async function claimFaucet(){
  var addr=document.getElementById("fAddr").value||userAddr;var msg=document.getElementById("fMsg");
  if(!addr){msg.style.color="var(--red)";msg.textContent="Connect wallet first";return}
  msg.style.color="var(--t2)";msg.textContent="Claiming...";
  try{
    var r=await(await fetch(API+"/api/faucet/claim",{method:"POST",headers:{"Content-Type":"application/json","X-Session":SESSION},body:JSON.stringify({address:addr})})).json();
    if(r.success){msg.style.color="var(--acc)";msg.textContent="OK "+r.amount+" S402 sent! Sig: "+sh(r.signature,16);lFS()}
    else{msg.style.color="var(--red)";msg.textContent="ERR "+r.error}
  }catch(e){msg.style.color="var(--red)";msg.textContent="Error: "+e.message}
}

async function lTokens(){
  var r=await fj("/api/dex/tokens");
  document.getElementById("tokList").innerHTML=r.map(function(t){
    return'<tr><td>'+t.logo+' <strong>'+t.name+'</strong></td><td class="m" style="color:var(--acc);font-weight:700">$'+t.symbol+'</td><td><span class="al" onclick="vAd(\''+t.mint+'\')">'+sh(t.mint,14)+'</span></td><td class="m">'+(t.supply?t.supply.toLocaleString():"")+'</td><td><span class="al" onclick="vAd(\''+t.creator+'\')">'+sh(t.creator)+'</span></td></tr>';
  }).join("");
}

async function lProgs(){
  if(!D.programs)await lStats();var p=D.programs||{};
  document.getElementById("progList").innerHTML=
    '<table class="tb"><thead><tr><th>Program</th><th>Address</th><th>Type</th></tr></thead><tbody>'+
    '<tr><td style="color:var(--acc)">S402 Mint</td><td><span class="al" onclick="vAd(\''+p.s402Mint+'\')">'+p.s402Mint+'</span></td><td><span class="bd bt">SPL</span></td></tr>'+
    '<tr><td style="color:var(--red)">wS402 Mint</td><td><span class="al" onclick="vAd(\''+p.ws402Mint+'\')">'+p.ws402Mint+'</span></td><td><span class="bd bt">SPL</span></td></tr>'+
    '<tr><td>DEX</td><td><span class="al">Built-in AMM</span></td><td><span class="bd bc2">Program</span></td></tr>'+
    '<tr><td>Launchpad</td><td><span class="al">SPL Token Factory</span></td><td><span class="bd bc2">Program</span></td></tr>'+
    '<tr><td>Faucet</td><td><span class="al" onclick="vAd(\''+(D.payer||"")+'\')">'+sh(D.payer||"",20)+'</span></td><td><span class="bd bc2">Program</span></td></tr>'+
    '<tr><td>Token Program</td><td><span class="al">'+p.tokenProgram+'</span></td><td><span class="bd bo">Solana</span></td></tr>'+
    '</tbody></table>';
}

async function doConvert(){
  var amt=document.getElementById("cvAmt").value;var msg=document.getElementById("cvMsg");
  if(!amt||parseFloat(amt)<10000){msg.style.color="var(--red)";msg.textContent="Min 10,000 wS402";return}
  msg.textContent="Converting...";
  try{
    var r=await(await fetch(API+"/api/convert",{method:"POST",headers:{"Content-Type":"application/json","X-Session":SESSION},body:JSON.stringify({address:userAddr||"anon",amount:amt})})).json();
    if(r.success){msg.style.color="var(--acc)";msg.textContent="Burned "+r.ws402Burned+" wS402 \u2192 Minted "+r.s402Minted+" S402"}
    else{msg.style.color="var(--red)";msg.textContent="ERR "+r.error}
  }catch(e){msg.style.color="var(--red)";msg.textContent="Error"}
}

async function doSearch(){
  var q=document.getElementById("searchIn").value.trim();if(!q)return;
  try{var r=await fj("/api/search/"+q);if(r.type==="tx")vTx(r.signature);else if(r.type==="account")vAd(r.pubkey);else if(r.type==="token")vAd(r.mint);else if(r.type==="block")vBk(r.slot)}catch(e){alert("Not found")}
}

async function connectWallet(){
  var wallets=[];
  if(window.phantom&&window.phantom.solana)wallets.push({name:"Phantom",icon:"👻",provider:window.phantom.solana});
  else if(window.solana&&window.solana.isPhantom)wallets.push({name:"Phantom",icon:"👻",provider:window.solana});
  if(window.backpack)wallets.push({name:"Backpack",icon:"🎒",provider:window.backpack});
  if(window.solflare)wallets.push({name:"Solflare",icon:"☀️",provider:window.solflare});

  // Remove old modal if exists
  var old=document.getElementById("walletModal");if(old)old.remove();

  // Build modal
  var modal=document.createElement("div");modal.id="walletModal";
  modal.style.cssText="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);backdrop-filter:blur(4px)";
  var box=document.createElement("div");
  box.style.cssText="background:#1a1a1a;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:28px;width:340px;max-width:90vw;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)";

  var title=document.createElement("div");
  title.style.cssText="font-family:var(--body);font-size:16px;font-weight:700;color:#fff;margin-bottom:4px";
  title.textContent="Connect Wallet";
  var sub=document.createElement("div");
  sub.style.cssText="font-family:var(--fn);font-size:10px;color:#555;margin-bottom:20px;letter-spacing:1px";
  sub.textContent="Select a Solana wallet";
  box.appendChild(title);box.appendChild(sub);

  if(wallets.length===0){
    var noWallet=document.createElement("div");
    noWallet.style.cssText="font-size:12px;color:#666;margin-bottom:16px;line-height:1.6";
    noWallet.textContent="No wallet detected. Install Phantom, Backpack, or Solflare.";
    box.appendChild(noWallet);
    // Manual paste option
    var inp=document.createElement("input");
    inp.style.cssText="width:100%;padding:10px 12px;background:#111;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#fff;font-family:var(--fn);font-size:11px;outline:none;margin-bottom:10px;text-align:center";
    inp.placeholder="Paste Solana address...";
    box.appendChild(inp);
    var pasteBtn=document.createElement("button");
    pasteBtn.style.cssText="width:100%;padding:10px;background:#FF5722;border:none;border-radius:8px;color:#fff;font-family:var(--body);font-size:13px;font-weight:600;cursor:pointer";
    pasteBtn.textContent="Connect";
    pasteBtn.onclick=function(){var a=inp.value.trim();if(a&&a.length>30){userAddr=a;document.getElementById("walBtn").textContent=a.slice(0,4)+"\u2026"+a.slice(-4);document.getElementById("fAddr").value=a;loadWalletBalance();modal.remove()}};
    box.appendChild(pasteBtn);
  } else {
    wallets.forEach(function(w){
      var btn=document.createElement("button");
      btn.style.cssText="width:100%;display:flex;align-items:center;gap:12px;padding:12px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;color:#fff;font-family:var(--body);font-size:14px;font-weight:500;cursor:pointer;margin-bottom:8px;transition:all .15s";
      btn.onmouseover=function(){btn.style.background="rgba(255,87,34,.06)";btn.style.borderColor="rgba(255,87,34,.15)"};
      btn.onmouseout=function(){btn.style.background="rgba(255,255,255,.03)";btn.style.borderColor="rgba(255,255,255,.06)"};
      var icon=document.createElement("span");icon.style.fontSize="20px";icon.textContent=w.icon;
      var name=document.createElement("span");name.textContent=w.name;
      var detected=document.createElement("span");
      detected.style.cssText="margin-left:auto;font-family:var(--fn);font-size:9px;color:#22C55E;letter-spacing:1px";
      detected.textContent="DETECTED";
      btn.appendChild(icon);btn.appendChild(name);btn.appendChild(detected);
      btn.onclick=async function(){modal.remove();await doConnect(w)};
      box.appendChild(btn);
    });
  }

  // Cancel button
  var cancel=document.createElement("button");
  cancel.style.cssText="width:100%;padding:10px;background:none;border:1px solid rgba(255,255,255,.06);border-radius:8px;color:#666;font-family:var(--body);font-size:12px;cursor:pointer;margin-top:4px";
  cancel.textContent="Cancel";
  cancel.onclick=function(){modal.remove()};
  box.appendChild(cancel);
  modal.appendChild(box);
  modal.onclick=function(e){if(e.target===modal)modal.remove()};
  document.body.appendChild(modal);
}

async function doConnect(wallet){
  try{
    var resp;
    if(wallet.name==="Solflare"){
      await wallet.provider.connect();
      resp={publicKey:wallet.provider.publicKey};
    }else{
      resp=await wallet.provider.connect();
    }
    userAddr=resp.publicKey.toString();
    document.getElementById("walBtn").textContent=wallet.name.slice(0,3).toUpperCase()+" "+userAddr.slice(0,4)+"\u2026"+userAddr.slice(-4);
    document.getElementById("fAddr").value=userAddr;
    loadWalletBalance();
  }catch(e){
    console.error("Wallet connect failed:",e);
  }
}
async function loadWalletBalance(){if(!userAddr)return;try{var w=await fj("/api/wallet/"+userAddr);document.getElementById("sBal").textContent=parseFloat(w.balance).toFixed(2)+" \u25CE"}catch(e){document.getElementById("sBal").textContent="\u2014"}}

async function lAgents(){
  var agents=await fj("/api/agents");
  document.getElementById("agBody").innerHTML=agents.map(function(a){
    var bdgs=(a.badges||[]).map(function(b){return'<span class="bd" style="background:'+b.color+'22;color:'+b.color+';margin:1px;font-size:8px">'+b.label+'</span>'}).join(" ");
    var moodMap={bullish:"\u25B2",bearish:"\u25BC",cautious:"\u25CF",excited:"\u26A1",neutral:"\u25CB"};
    var mood=(moodMap[a.mood]||"\u25CB")+" "+(a.mood||"");
    var status=a.isActive?'<span class="bd bo">LIVE</span>':'<span class="bd" style="background:var(--bg3);color:var(--t3)">idle</span>';
    return'<tr><td style="font-weight:700;color:var(--acc)">'+a.name+'</td><td><span class="al" onclick="vAd(\''+a.pubkey+'\')">'+sh(a.pubkey)+'</span></td><td>'+bdgs+'</td><td title="'+(a.reasoning||"")+'">'+mood+'</td><td style="font-size:10px;color:var(--t3)">'+(a.lastAction||"\u2014")+'</td><td>'+status+'</td></tr>';
  }).join("");
}

async function lTokenomics(){
  try{
    var d=await fj("/api/tokenomics");
    var colors={"Faucet Pool":"var(--acc)","Mining Rewards":"#f59e0b","DEX Liquidity":"#06d6a0","Agent Operations":"#818cf8","Bridge Reserve":"var(--red)","Team":"#a78bfa","Ecosystem Fund":"#f472b6"};
    var keyMap={"Faucet Pool":"faucet","Mining Rewards":"mining","DEX Liquidity":"dexLp","Agent Operations":"agents","Bridge Reserve":"bridge","Team":"team","Ecosystem Fund":"ecosystem"};
    document.getElementById("tokBody").innerHTML=d.allocation.map(function(a){
      var w=d.wallets.find(function(w){return w.key===keyMap[a.name]});
      var bal=w?w.balance.toLocaleString(undefined,{maximumFractionDigits:0}):"\u2014";
      var addr=a.wallet==="distributed"?'<span style="color:var(--t3)">12 agent wallets</span>':'<span class="al" onclick="vAd(\''+a.wallet+'\')">'+a.wallet.slice(0,6)+"\u2026"+a.wallet.slice(-4)+'</span>';
      return'<tr><td><span style="color:'+(colors[a.name]||"var(--t1)")+';font-weight:700">'+a.name+'</span><div style="font-size:8px;color:var(--t3);margin-top:2px">'+a.desc+'</div></td><td class="m" style="font-weight:700;color:var(--acc)">'+a.pct+'</td><td class="m">'+a.amount.toLocaleString()+'</td><td>'+addr+'</td><td class="m" style="color:var(--acc)">'+bal+'</td></tr>';
    }).join("");
    document.getElementById("tokCirc").innerHTML='<span style="color:var(--t3)">Circulating:</span> <span style="color:var(--acc);font-weight:700">'+Math.floor(d.circulating).toLocaleString()+' S402</span> \u00B7 <span style="color:var(--t3)">Faucet claims:</span> <span style="color:var(--t1)">'+d.faucetClaims+'</span> \u00B7 <span style="color:var(--t3)">Blocks mined:</span> <span style="color:var(--t1)">'+d.miningBlocksMined+'</span>';
  }catch(e){}
}

// MINING
var mining=false,mMyBlocks=0,mMyReward=0,mChallenge=null;
async function sha256(str){var buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,"0")}).join("")}

async function toggleMining(){
  if(!userAddr){alert("Connect wallet first!");return}
  if(mining){stopMining();return}
  mining=true;
  document.getElementById("mStartBtn").textContent="STOP MINING";
  document.getElementById("mStartBtn").style.background="var(--red)";
  document.getElementById("mStartBtn").style.color="#fff";
  document.getElementById("mWalletInfo").style.color="var(--acc)";
  document.getElementById("mWalletInfo").textContent="Mining to: "+userAddr.slice(0,8)+"..."+userAddr.slice(-4);
  mChallenge=await fj("/api/mining/challenge");
  document.getElementById("mDiff").textContent=mChallenge.difficulty;
  startMiningLoop();
}

function stopMining(){
  mining=false;
  document.getElementById("mStartBtn").textContent="START MINING";
  document.getElementById("mStartBtn").style.background="var(--acc)";
  document.getElementById("mStartBtn").style.color="#000";
  document.getElementById("mStatus").textContent="Mining stopped";
}

async function startMiningLoop(){
  var nonce=Math.floor(Math.random()*1e12),batchSize=5000,lastRateCheck=Date.now(),hashCount=0;
  var hbInterval=setInterval(function(){
    if(!mining){clearInterval(hbInterval);return}
    var hr=Math.floor(hashCount/((Date.now()-lastRateCheck)/1000));
    document.getElementById("mHashrate").textContent=hr>1000?(hr/1000).toFixed(1)+" KH/s":hr+" H/s";
    fetch(API+"/api/mining/heartbeat",{method:"POST",headers:{"Content-Type":"application/json","X-Session":SESSION},body:JSON.stringify({miner:userAddr,hashrate:hr})});
    loadMiningStats();
  },3000);
  while(mining){
    if(!mChallenge)mChallenge=await fj("/api/mining/challenge");
    var target=mChallenge.target,found=false;
    for(var i=0;i<batchSize&&mining;i++){
      var data=mChallenge.block+":"+mChallenge.previousHash+":"+nonce+":"+userAddr;
      var hash=await sha256(data);hashCount++;
      if(hash<=target){
        document.getElementById("mStatus").style.color="var(--acc)";
        document.getElementById("mStatus").textContent="BLOCK FOUND! Submitting...";
        try{
          var r=await(await fetch(API+"/api/mining/submit",{method:"POST",headers:{"Content-Type":"application/json","X-Session":SESSION},body:JSON.stringify({nonce:nonce.toString(),hash:hash,miner:userAddr})})).json();
          if(r.success){mMyBlocks++;mMyReward+=r.reward;document.getElementById("mBlocks").textContent=mMyBlocks;document.getElementById("mReward").textContent=mMyReward.toFixed(2);document.getElementById("mStatus").textContent="Block #"+r.block.height+" mined! +"+r.reward+" S402";mChallenge=await fj("/api/mining/challenge")}
          else{document.getElementById("mStatus").style.color="var(--red)";document.getElementById("mStatus").textContent="ERR "+(r.error||"Rejected");mChallenge=await fj("/api/mining/challenge")}
        }catch(e){mChallenge=null}
        found=true;break;
      }
      nonce++;
    }
    if(!found){document.getElementById("mStatus").style.color="var(--t3)";document.getElementById("mStatus").textContent="Mining block #"+mChallenge.block+"... nonce: "+nonce.toLocaleString()}
    await new Promise(function(resolve){setTimeout(resolve,1)});
  }
}

async function loadMiningStats(){
  try{
    var s=await fj("/api/mining/stats");
    document.getElementById("mNetHash").textContent=s.networkHashrate>1000?(s.networkHashrate/1000).toFixed(1)+"K":s.networkHashrate;
    document.getElementById("mMiners").textContent=s.activeMiners;
    document.getElementById("mTotal").textContent=s.totalBlocksMined;
    document.getElementById("mDiff").textContent=s.difficulty;
    document.getElementById("mHalving").textContent=s.nextHalving?s.nextHalving.toLocaleString():"";
    document.getElementById("mLeaderboard").innerHTML=(s.miners||[]).slice(0,10).map(function(m,i){
      return'<tr><td style="color:var(--t3)">'+(i+1)+'</td><td><span class="al" onclick="vAd(\''+m.address+'\')">'+sh(m.address)+'</span></td><td class="m" style="color:var(--acc)">'+m.blocksMined+'</td><td class="m">'+m.totalReward.toFixed(2)+'</td><td class="m" style="color:var(--t3)">'+(m.hashrate>1000?(m.hashrate/1000).toFixed(1)+"K":m.hashrate)+'</td></tr>';
    }).join("")||'<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:16px">No miners yet</td></tr>';
    document.getElementById("mRecent").innerHTML=(s.recentBlocks||[]).map(function(b){
      return'<tr><td class="m" style="color:var(--acc)">#'+b.height+'</td><td><span class="al" onclick="vAd(\''+b.miner+'\')">'+sh(b.miner)+'</span></td><td class="m" style="font-size:9px;color:var(--t4)">'+b.hash.slice(0,16)+'...</td><td class="m" style="color:var(--acc)">'+b.reward+'</td><td style="color:var(--t3)">'+ta(Math.floor(b.timestamp/1000))+' ago</td></tr>';
    }).join("")||'<tr><td colspan="5" style="text-align:center;color:var(--t3);padding:16px">No blocks mined yet</td></tr>';
  }catch(e){}
}

lStats();lB(1);lT(1);setInterval(function(){lStats();lB(bPg);lT(tPg)},5000);
