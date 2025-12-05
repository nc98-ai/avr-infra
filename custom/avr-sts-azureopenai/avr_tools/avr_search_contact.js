const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const Fuse = require("fuse.js");
const natural = require("natural");

const metaphone = natural.Metaphone;

let phoneBook = [];
let fuseIndex = null;

// --- 1. FONCTIONS UTILITAIRES ---

const normalize = (str) => {
  if (!str || typeof str !== 'string') return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

const getPhonetics = (str) => {
    try {
        if (!str) return "";
        const clean = normalize(str);
        if (!clean) return "";
        if (metaphone && typeof metaphone.process === 'function') {
            return metaphone.process(clean) || "";
        } else {
            return clean;
        }
    } catch (e) {
        return "";
    }
};

const formatPhoneNC = (rawNum) => {
    if (!rawNum) return "Non renseigné";
    const digits = rawNum.replace(/[^0-9]/g, '');
    if (digits.length === 6) {
        return digits.match(/.{1,2}/g).join(" ");
    }
    return digits;
};

const formatSpelling = (str) => {
    if (!str) return "";
    return str.trim().toUpperCase().split("").join("-");
};

// Convertisseur Mots -> Chiffres
const convertTextToDigits = (text) => {
    if (!text) return "";
    const map = {
        'zero': '0', 'zéro': '0', 'un': '1', 'une': '1', 'deux': '2', 'trois': '3',
        'quatre': '4', 'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9'
    };
    let cleanText = text.toLowerCase();
    for (const [word, digit] of Object.entries(map)) {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        cleanText = cleanText.replace(regex, digit);
    }
    return cleanText;
};

// --- 2. CHARGEMENT ET INDEXATION ---

try {
  const csvPath = path.join(__dirname, "../data/annuaire.csv");
  console.log(`[Annuaire] Chargement depuis : ${csvPath}`);
  
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    const rawData = parse(fileContent, {
      columns: true, skip_empty_lines: true, trim: true,
      delimiter: [';', ',', '\t'], relax_quotes: true, relax_column_count: true 
    });

    phoneBook = rawData.map((entry) => {
        const keys = Object.keys(entry);
        const findVal = (patterns) => {
            const key = keys.find(k => patterns.includes(normalize(k)));
            return key ? entry[key] : "";
        };

        const nom = findVal(["nom", "name", "lastname"]) || "";
        const prenom = findVal(["prenom", "firstname"]) || "";
        const tel = findVal(["telephone", "phone", "tel", "mobile", "fixe"]) || "";
        const adresse = findVal(["adresse", "address", "rue"]) || "";
        const ville = findVal(["ville", "city", "commune"]) || "";
        
        // --- NOUVEAU : Récupération du Type de téléphone ---
        // On cherche "type_telephone", "techno", "type", etc.
        const typeTel = findVal(["type_telephone", "typetelephone", "type", "techno"]) || "Non spécifié";

        return {
            nom, prenom, telephone: tel, adresse, ville, typeTel, // On stocke le type
            
            _fullName: `${prenom} ${nom}`,
            _reverseName: `${nom} ${prenom}`,
            _phonoFull: getPhonetics(prenom + nom),
            _phonoReverse: getPhonetics(nom + prenom),
            _phonoNom: getPhonetics(nom),
            _phonoVille: getPhonetics(ville)
        };
    });
    
    // DEBUG : Vérification que la colonne est bien lue
    if (phoneBook.length > 0) {
        console.log("------------------------------------------------");
        console.log("[Annuaire] TEST LIGNE 1 :", JSON.stringify(phoneBook[0], null, 2));
        console.log("------------------------------------------------");
    }

    if (phoneBook.length > 0) {
        fuseIndex = new Fuse(phoneBook, {
            includeScore: true, 
            keys: [
                { name: '_fullName', weight: 1.0 },
                { name: '_reverseName', weight: 1.0 },
                { name: '_phonoFull', weight: 0.8 },
                { name: '_phonoReverse', weight: 0.8 },
                { name: 'nom', weight: 0.6 },
                { name: '_phonoNom', weight: 0.5 },
                { name: 'telephone', weight: 1.0 }
            ],
            threshold: 0.4, distance: 100, ignoreLocation: true
        });
    }
  } else { console.warn(`[Annuaire] Erreur: Fichier introuvable.`); }
} catch (err) { console.error("[Annuaire] Crash chargement:", err); }

// --- 3. HANDLER ---

module.exports = {
  name: "search_contact",
  description: "Recherche un contact (Nom/Prénom/Tél). Retourne le nom, le numéro et le type (Mobile/Fixe).",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Nom/Prénom ou Numéro." },
      city: { type: "string", description: "Ville (optionnel)." }
    },
    required: ["query"],
  },
  handler: async (uuid, { query, city }) => {
    try {
        console.log(`[Tool: Search] Requête brute: "${query}" (Ville: ${city || "Non spécifiée"})`);

        if (!phoneBook.length || !fuseIndex) return "Erreur technique: Annuaire vide.";

        const queryWithDigits = convertTextToDigits(query);
        const digitsOnly = queryWithDigits.replace(/[^0-9]/g, '');
        const isPhoneSearch = digitsOnly.length >= 3;
        
        let results = [];

        if (isPhoneSearch) {
            console.log(`[Tool: Search] Mode TÉLÉPHONE (Chiffres: ${digitsOnly})`);
            results = phoneBook.filter(entry => {
                const entryNum = (entry.telephone || "").replace(/[^0-9]/g, '');
                return entryNum.includes(digitsOnly);
            }).map(item => ({ item, score: 0 })); 
        } else {
            console.log(`[Tool: Search] Mode NOM`);
            const queryPhonetic = getPhonetics(query);
            results = fuseIndex.search({
                $or: [
                    { _fullName: query },
                    { _reverseName: query },
                    { _phonoFull: queryPhonetic },
                    { _phonoReverse: queryPhonetic },
                    { _phonoNom: queryPhonetic }
                ]
            });
        }

        if (city && results.length > 0) {
            const normalizedCitySearch = normalize(city);
            const phoneticCitySearch = getPhonetics(city);
            const cityMatches = results.filter(res => {
                const entryCity = normalize(res.item.ville);
                const entryCityPhono = res.item._phonoVille;
                return entryCity.includes(normalizedCitySearch) || 
                       (entryCityPhono && phoneticCitySearch && entryCityPhono.includes(phoneticCitySearch));
            });
            if (cityMatches.length > 0) results = cityMatches;
        }

        if (!isPhoneSearch && results.length > 0) {
            const cutoff = results[0].score + 0.25;
            results = results.filter(res => res.score <= cutoff);
        }

        // --- FORMATAGE FINAL DE LA RÉPONSE ---
        const limitedResults = results.slice(0, 5).map(res => ({
            nom: res.item.nom,
            prenom: res.item.prenom,
            nom_epelle: formatSpelling(res.item.nom),
            prenom_epelle: formatSpelling(res.item.prenom),
            telephone: formatPhoneNC(res.item.telephone),
            
            // --- NOUVEAU : ON ENVOIE LE TYPE À L'IA ---
            type_ligne: res.item.typeTel, // Ex: "MOBILE" ou "FIXE"
            
            adresse: res.item.adresse,
            ville: res.item.ville
        }));

        console.log(`[Tool: Search] ${limitedResults.length} résultats renvoyés.`);
        
        if (limitedResults.length === 0) return "Aucun résultat trouvé.";
        
        // On renvoie le JSON avec le champ 'type_ligne'
        return JSON.stringify(limitedResults);

    } catch (error) {
        console.error("[Tool: Search] CRASH :", error);
        return "Erreur technique.";
    }
  },
};