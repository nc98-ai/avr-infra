const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const Fuse = require("fuse.js");
const natural = require("natural");

// CORRECTION ICI : On utilise Metaphone standard (plus stable que DoubleMetaphone)
const metaphone = natural.Metaphone;

let phoneBook = [];
let fuseIndex = null;

// Normalisation simple
const normalize = (str) => {
  if (!str || typeof str !== 'string') return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

// Récupération phonétique SÉCURISÉE
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
        console.error("Erreur phonétique sur:", str, e.message);
        return "";
    }
};

try {
  const csvPath = path.join(__dirname, "../data/annuaire.csv");
  console.log(`[Annuaire] Chargement depuis : ${csvPath}`);
  
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    
    // 1. Parsing CSV
    const rawData = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [';', ',', '\t'],
      relax_quotes: true,
      relax_column_count: true 
    });

    // 2. Mappage des données
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

        return {
            original: entry,
            nom: nom,
            prenom: prenom,
            telephone: tel,
            adresse: adresse,
            ville: ville,
            
            // Champs calculés pour la recherche
            _fullName: `${prenom} ${nom}`,
            _phonoFull: getPhonetics(prenom + nom),
            _phonoNom: getPhonetics(nom)
        };
    });
    
    console.log(`[Annuaire] ${phoneBook.length} entrées chargées.`);
    
    // DEBUG : Vérification
    if (phoneBook.length > 0) {
        console.log("------------------------------------------------");
        console.log("[Annuaire] TEST LIGNE 1 :", JSON.stringify(phoneBook[0], null, 2));
        console.log("[Annuaire] TEST PHONETIQUE 'Simon' :", getPhonetics("Simon"));
        console.log("------------------------------------------------");
    }

    // 3. Configuration Fuse.js
    if (phoneBook.length > 0) {
        const options = {
            includeScore: true,
            keys: [
                { name: '_fullName', weight: 1.0 },
                { name: '_phonoFull', weight: 0.8 },
                { name: 'nom', weight: 0.6 },
                { name: '_phonoNom', weight: 0.5 },
                { name: 'telephone', weight: 1.0 }
            ],
            threshold: 0.4, 
            distance: 100,
            ignoreLocation: true
        };
        fuseIndex = new Fuse(phoneBook, options);
    }

  } else {
    console.warn(`[Annuaire] ERREUR : Fichier CSV introuvable à ${csvPath}`);
  }
} catch (err) {
  console.error("[Annuaire] CRASH au chargement:", err);
}

module.exports = {
  name: "search_contact",
  description: "Recherche un contact dans l'annuaire (Nom, Prénom ou Téléphone).",
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
        console.log(`[Tool: Search] Requête reçue: "${query}" (Ville: ${city})`);

        if (!phoneBook.length || !fuseIndex) {
             return "Erreur technique: Annuaire vide.";
        }

        const isPhoneSearch = /^[0-9\s\.\-\+]+$/.test(query);
        let results = [];

        if (isPhoneSearch) {
            // Recherche par numéro
            const cleanNum = query.replace(/[^0-9]/g, '');
            results = phoneBook.filter(entry => {
                const entryNum = (entry.telephone || "").replace(/[^0-9]/g, '');
                return entryNum.includes(cleanNum);
            }).map(item => ({ item, score: 0 })); 
        } else {
            // Recherche par Nom (Texte + Phonétique)
            const queryPhonetic = getPhonetics(query);
            
            results = fuseIndex.search({
                $or: [
                    { _fullName: query },
                    { _phonoFull: queryPhonetic },
                    { _phonoNom: queryPhonetic }
                ]
            });
        }

        // Filtrage Ville
        if (city && results.length > 0) {
            const normalizedCitySearch = normalize(city);
            results = results.filter(res => {
                const entryCity = normalize(res.item.ville);
                return entryCity.includes(normalizedCitySearch);
            });
        }

        // --- AJOUT DE LA FONCTION DE FORMATAGE ---
        // Force le format "XX XX XX" pour que l'IA ne se trompe pas en lisant
        const formatPhoneNC = (rawNum) => {
            if (!rawNum) return "Non renseigné";
            const digits = rawNum.replace(/[^0-9]/g, '');
            
            // Si c'est un numéro à 6 chiffres (standard NC)
            if (digits.length === 6) {
                // Découpe en morceaux de 2 et rejoint par un espace
                return digits.match(/.{1,2}/g).join(" ");
            }
            return digits;
        };
        // -----------------------------------------

        const limitedResults = results.slice(0, 5).map(res => ({
            nom: res.item.nom,
            prenom: res.item.prenom,
            // Application du formatage ici
            telephone: formatPhoneNC(res.item.telephone), 
            adresse: res.item.adresse,
            ville: res.item.ville
        }));

        console.log(`[Tool: Search] ${limitedResults.length} résultats trouvés.`);
        
        if (limitedResults.length === 0) {
            return "Aucun résultat trouvé dans l'annuaire.";
        }

        return JSON.stringify(limitedResults);

    } catch (error) {
        console.error("[Tool: Search] CRASH PENDANT LA RECHERCHE :", error);
        return "Erreur technique lors de la recherche.";
    }
  },
};