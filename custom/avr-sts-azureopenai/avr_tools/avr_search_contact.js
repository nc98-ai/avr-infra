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
        console.error("Erreur phonétique sur:", str, e.message);
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

// NOUVEAU : Fonction pour préparer l'épellation (ex: "Paul" -> "P-A-U-L")
const formatSpelling = (str) => {
    if (!str) return "";
    // On nettoie les espaces inutiles, on met en majuscule, et on sépare par des tirets
    return str.trim().toUpperCase().split("").join("-");
};

// --- 2. CHARGEMENT ET INDEXATION ---

try {
  const csvPath = path.join(__dirname, "../data/annuaire.csv");
  console.log(`[Annuaire] Chargement depuis : ${csvPath}`);
  
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    
    const rawData = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [';', ',', '\t'],
      relax_quotes: true,
      relax_column_count: true 
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

        return {
            nom: nom,
            prenom: prenom,
            telephone: tel,
            adresse: adresse,
            ville: ville,
            
            // Champs de recherche
            _fullName: `${prenom} ${nom}`,
            _phonoFull: getPhonetics(prenom + nom),
            _reverseName: `${nom} ${prenom}`,
            _phonoReverse: getPhonetics(nom + prenom),
            _phonoNom: getPhonetics(nom),
            _phonoVille: getPhonetics(ville)
        };
    });
    
    console.log(`[Annuaire] ${phoneBook.length} entrées chargées.`);
    
    if (phoneBook.length > 0) {
        const options = {
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

// --- 3. DÉFINITION DE L'OUTIL ---

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
        console.log(`[Tool: Search] Requête reçue: "${query}" (Ville: ${city || "Non spécifiée"})`);

        if (!phoneBook.length || !fuseIndex) {
             return "Erreur technique: Annuaire vide.";
        }

        const isPhoneSearch = /^[0-9\s\.\-\+]+$/.test(query);
        let results = [];

        if (isPhoneSearch) {
            // A. TÉLÉPHONE
            const cleanNum = query.replace(/[^0-9]/g, '');
            results = phoneBook.filter(entry => {
                const entryNum = (entry.telephone || "").replace(/[^0-9]/g, '');
                return entryNum.includes(cleanNum);
            }).map(item => ({ item, score: 0 })); 

        } else {
            // B. NOM
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

        // C. FILTRAGE VILLE INTELLIGENT (ASSOUPLI)
        if (city && results.length > 0) {
            const normalizedCitySearch = normalize(city);
            const phoneticCitySearch = getPhonetics(city);
            
            const cityMatches = results.filter(res => {
                const entryCity = normalize(res.item.ville);
                const entryCityPhono = res.item._phonoVille;
                const textMatch = entryCity.includes(normalizedCitySearch);
                const phonoMatch = entryCityPhono && phoneticCitySearch && 
                                   entryCityPhono.includes(phoneticCitySearch);
                return textMatch || phonoMatch;
            });

            const hasStrongMatchInCity = cityMatches.some(res => res.score < 0.5);

            if (hasStrongMatchInCity) {
                console.log(`[Tool: Search] Match confirmé à ${city}. Filtrage appliqué.`);
                results = cityMatches;
            } else {
                console.log(`[Tool: Search] Pas de match convaincant à ${city}. On renvoie les meilleurs résultats globaux.`);
            }
        }

        // D. NETTOYAGE DYNAMIQUE RELATIF (GAP STRATEGY)
        if (results.length > 0) {
            const bestScore = results[0].score;
            const toleranceGap = 0.25; 
            const cutoff = bestScore + toleranceGap;
            results = results.filter(res => res.score <= cutoff);
        }

        // E. RETOUR AVEC AIDE A L'EPELLATION
        const limitedResults = results.slice(0, 5).map(res => ({
            nom: res.item.nom,
            prenom: res.item.prenom,
            // C'EST ICI QUE CA SE JOUE : On donne l'épellation toute faite à l'IA
            nom_epelle: formatSpelling(res.item.nom),       // "M-A-F-I-L-E-O"
            prenom_epelle: formatSpelling(res.item.prenom), // "R-O-M-A-I-N"
            
            telephone: formatPhoneNC(res.item.telephone), 
            adresse: res.item.adresse,
            ville: res.item.ville
        }));

        console.log(`[Tool: Search] ${limitedResults.length} résultats renvoyés.`);
        
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