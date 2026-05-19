//////////////////////////////////////////////////
// 🔥 CONFIG SUPABASE
//////////////////////////////////////////////////
const SUPABASE_URL = "https://gkqlmpkmzfvurkzgrjlm.supabase.co";
const SUPABASE_KEY = "sb_publishable_TpKfbr8y19-DzT9dQvlr5Q_2MR-ciXr";

//////////////////////////////////////////////////
// 🔥 VARIABLES & SECURE ID
//////////////////////////////////////////////////
let countdown;
let checkInterval;
let essais = 0;
let timerStarted = false;
let derniereVerification = "";

// Évite le crash HTTPS / local de crypto.randomUUID
function genererIdentifiantSecours() {
    return 'dev-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function obtenirAppareilID() {
    let id = localStorage.getItem("appareilID");
    if (!id) {
        try {
            id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : genererIdentifiantSecours();
        } catch (e) {
            id = genererIdentifiantSecours();
        }
        localStorage.setItem("appareilID", id);
    }
    return id;
}

let appareilID = obtenirAppareilID();

//////////////////////////////////////////////////
// 🔐 CONNEXION
//////////////////////////////////////////////////
function connexion(){
    const phone = document.getElementById("loginPhone").value.trim();

    if(!phone){
        alert("Entre ton numéro ❌");
        return;
    }

    if(phone.length < 8){
        alert("Numéro invalide ❌");
        return;
    }

    // Sauvegarde locale pour maintenir la session
    localStorage.setItem("phone", phone);

    // Basculement des affichages graphiques
    document.getElementById("loginBox").style.display="none";
    document.getElementById("siteBox").style.display="block";

    restaurerCode();
    surveillerConfirmation();
}

//////////////////////////////////////////////////
// 🔓 DECONNEXION
//////////////////////////////////////////////////
function deconnexion(){
    localStorage.removeItem("phone");

    document.getElementById("loginBox").style.display="block";
    document.getElementById("siteBox").style.display="none";
    document.getElementById("topcode").style.display="none";
    document.getElementById("timer").style.display="none";
    document.getElementById("code").value="";

    const oldBtn1 = document.querySelector(".downloadBtn");
    if(oldBtn1){ oldBtn1.remove(); }

    clearInterval(checkInterval);
    clearInterval(countdown);
    timerStarted = false;
}

//////////////////////////////////////////////////
// 🔄 RESTAURER SESSION AU CHARGEMENT
//////////////////////////////////////////////////
window.onload = function(){
    const phone = localStorage.getItem("phone");

    if(phone){
        document.getElementById("loginBox").style.display="none";
        document.getElementById("siteBox").style.display="block";
        restaurerCode();
        surveillerConfirmation();
    }else{
        document.getElementById("loginBox").style.display="block";
        document.getElementById("siteBox").style.display="none";
    }
}

//////////////////////////////////////////////////
// 🔄 RESTAURER CODE DEPUIS SUPABASE
//////////////////////////////////////////////////
async function restaurerCode(){
    const phone = localStorage.getItem("phone");
    if(!phone) return;

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/payments?phone=eq.${phone}&status=eq.confirmé&select=*`,
        {
            headers:{
                apikey:SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    const data = await res.json();
    if(!data || data.length===0) return;

    const p = data[data.length - 1];

    if(new Date(p.expires_at) > new Date()){
        document.getElementById("topcode").style.display="block";
        document.getElementById("topcode").innerHTML = "🔑 Code actif : " + p.code;
        document.getElementById("code").value = p.code;

        if(!timerStarted){
            startTimer(p.expires_at);
            timerStarted = true;
        }
    }
}

//////////////////////////////////////////////////
// 💰 INITIALISER UN PAIEMENT
//////////////////////////////////////////////////
async function payer(){
    const phone = localStorage.getItem("phone");

    if(!phone){
        alert("Reconnecte-toi ❌");
        return;
    }

    document.getElementById("payBtn").disabled = true;

    const check = await fetch(
        `${SUPABASE_URL}/rest/v1/payments?phone=eq.${phone}&status=eq.en attente`,
        {
            headers:{
                apikey:SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    const oldData = await check.json();

    if(oldData.length > 0){
        alert("Paiement déjà envoyé ⏳");
        document.getElementById("payBtn").disabled = false;
        return;
    }

    await fetch(
        `${SUPABASE_URL}/rest/v1/payments`,
        {
            method:"POST",
            headers:{
                apikey:SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                phone:phone,
                status:"en attente",
                created_at: new Date().toISOString()
            })
        }
    );

    alert("Paiement envoyé ✔");
    document.getElementById("payBtn").disabled = false;
}

//////////////////////////////////////////////////
// 🔄 SURVEILLER CONFIRMATION DE PAIEMENT
//////////////////////////////////////////////////
function surveillerConfirmation(){
    clearInterval(checkInterval);

    checkInterval = setInterval(async ()=>{
        const phone = localStorage.getItem("phone");
        if(!phone) return;

        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/payments?phone=eq.${phone}&status=eq.confirmé&select=*`,
            {
                headers:{
                    apikey:SUPABASE_KEY,
                    Authorization: `Bearer ${SUPABASE_KEY}`
                }
            }
        );

        const data = await res.json();
        if(!data || data.length===0) return;

        const p = data[data.length - 1];

        if(new Date(p.expires_at) < new Date()){
            document.getElementById("topcode").style.display="none";
            document.getElementById("code").value="";
            return;
        }

        if(p.device_id && p.device_id !== appareilID){
            alert("Compte utilisé sur un autre appareil ❌");
            deconnexion();
            return;
        }

        if(derniereVerification === p.code) return;
        derniereVerification = p.code;

        document.getElementById("topcode").style.display="block";
        document.getElementById("topcode").innerHTML = "🔑 Code actif : " + p.code;
        document.getElementById("code").value = p.code;

        if(!timerStarted){
            startTimer(p.expires_at);
            timerStarted = true;
        }

    }, 10000);
}

//////////////////////////////////////////////////
// 🔑 VERIFIER LE CODE ET ASSIGNER L'APPAREIL
//////////////////////////////////////////////////
async function verifier(){
    if(essais >= 5){
        alert("Trop de tentatives ❌");
        return;
    }

    const code = document.getElementById("code").value.trim();
    const phone = localStorage.getItem("phone");

    if(!phone){
        alert("Reconnecte-toi ❌");
        return;
    }

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/payments?phone=eq.${phone}&code=eq.${code}&status=eq.confirmé`,
        {
            headers:{
                apikey:SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    const data = await res.json();

    if(!data || data.length===0){
        essais++;
        alert("Code invalide ❌");
        return;
    }

    const p = data[0];

    if(p.device_id && p.device_id !== appareilID){
        alert("Compte déjà utilisé ailleurs ❌");
        return;
    }

    if(new Date(p.expires_at) < new Date()){
        alert("Code expiré ❌");
        document.getElementById("code").value="";
        return;
    }

    essais = 0;

    await fetch(
        `${SUPABASE_URL}/rest/v1/payments?id=eq.${p.id}`,
        {
            method:"PATCH",
            headers:{
                apikey:SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                device_id:appareilID
            })
        }
    );

    startTimer(p.expires_at);
    alert("Accès autorisé ✔");

    document.getElementById("topcode").style.display="block";
    document.getElementById("topcode").innerHTML = "🔑 Code actif : " + p.code;

    ouvrirPdfProtege(p.expires_at);

    const oldBtn2 = document.querySelector(".downloadBtn");
    if(oldBtn2){ oldBtn2.remove(); }

    setTimeout(()=>{
        const btn = document.createElement("button");
        btn.className = "downloadBtn";
        btn.innerText = "⬇ Télécharger PDF";

        btn.style.position="fixed";
        btn.style.bottom="20px";
        btn.style.left="50%";
        btn.style.transform= "translateX(-50%)";
        btn.style.padding="15px";
        btn.style.background="green";
        btn.style.color="white";
        btn.style.border="none";
        btn.style.borderRadius="10px";
        btn.style.zIndex="9999";

        btn.onclick = ()=>{
            if(new Date(p.expires_at) < new Date()){
                alert("Code expiré ❌");
                btn.remove();
                return;
            }

            const a = document.createElement("a");
            a.href = "formation2026.pdf?nocache=" + Date.now();
            a.download = "formation2026.pdf";
            a.click();
        }; 

        document.body.appendChild(btn);
    }, 1000);
} 

//////////////////////////////////////////////////
// 🔒 OUVERTURE DU PDF
//////////////////////////////////////////////////
function ouvrirPdfProtege(expireDate){
    if(new Date(expireDate) < new Date()){
        alert("Code expiré ❌");
        return;
    }
    window.open("formation2026.pdf?nocache=" + Date.now(), "_blank");
}

//////////////////////////////////////////////////
// ⏳ GESTIONNAIRE DU COMPTE À REBOURS
//////////////////////////////////////////////////
function startTimer(expireDate){
    clearInterval(countdown);
    const exp = new Date(expireDate);

    document.getElementById("timer").style.display="block";

    countdown = setInterval(()=>{
        const diff = exp - new Date();

        if(diff <= 0){
            document.getElementById("timer").innerHTML = "❌ Code expiré";
            document.getElementById("topcode").style.display="none";
            document.getElementById("code").value="";
            
            const oldBtn3 = document.querySelector(".downloadBtn");
            if(oldBtn3){ oldBtn3.remove(); }
            
            timerStarted = false;
            clearInterval(countdown);
            return;
        }

        const h = Math.floor(diff/3600000);
        const m = Math.floor((diff%3600000)/60000);
        const s = Math.floor((diff%60000)/1000);

        document.getElementById("timer").innerHTML = "⏳ Expire dans " + h + "h " + m + "m " + s + "s";
    }, 1000);
}