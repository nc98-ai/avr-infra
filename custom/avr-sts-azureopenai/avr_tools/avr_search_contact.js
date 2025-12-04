const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const Fuse = require("fuse.js");
const natural = require("natural");

// On utilise Metaphone standard (plus robuste que DoubleMetaphone)
const metaphone = natural.Metaphone;

let phoneBook = [];
let fuseIndex = null;

// --- 1. FONCTIONS UTILITAIRES ---

// Normalisation (minuscule, sans accent, trim)
const normalize = (str) => {
  if (!str || typeof str !== 'string') return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

// Phonétique Sécurisée
const getPhonetics = (str) => {
    try {
        if (!str) return "";
        const clean = normalize(str);
        if (!clean) return "";
        
        // Vérification que la librairie est bien chargée
        if (metaphone && typeof metaphone.process === 'function') {
            return metaphone.process(clean) || "";
        } else {
            return clean; // Fallback texte si erreur
        }
    } catch (e) {
        console.error("Erreur phonétique sur:", str, e.message);
        return "";
    }
};

// Formatage Numéro Calédonien (XX XX XX)
const formatPhoneNC = (rawNum) => {
    if (!rawNum) return "Non renseigné";
    const digits = rawNum.replace(/[^0-9]/g, '');
    // Standard NC : 6 chiffres
    if (digits.length === 6) {
        return digits.match(/.{1,2}/g).join(" ");
    }
    return digits;
};

// --- 2. CHARGEMENT ET INDEXATION ---

try {
  const csvPath = path.join(__dirname, "../data/annuaire.csv");
  console.log(`[Annuaire] Chargement depuis : ${csvPath}`);
  
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    
    // Parsing CSV (supporte ; , et tab)
    const rawData = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [';', ',', '\t'],
      relax_quotes: true,
      relax_column_count: true 
    });

    // Mappage des données + Création des champs de recherche
    phoneBook = rawData.map((entry) => {
        const keys = Object.keys(entry);
        
        // Helper pour trouver une colonne peu importe la casse (Nom/nom/NOM)
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
            // Données brutes pour l'affichage
            nom: nom,
            prenom: prenom,
            telephone: tel,
            adresse: adresse,
            ville: ville,
            
            // --- CHAMPS DE RECHERCHE (TEXTE + PHONÉTIQUE) ---
            
            // 1. Sens Normal : "Adrien Ali"
            _fullName: `${prenom} ${nom}`,
            _phonoFull: getPhonetics(prenom + nom),
            
            // 2. Sens Inversé : "Ali Adrien" (Vital si le client inverse)
            _reverseName: `${nom} ${prenom}`,
            _phonoReverse: getPhonetics(nom + prenom),
            
            // 3. Nom de famille seul (Filet de sécurité)
            _phonoNom: getPhonetics(nom),

            // 4. Phonétique de la ville (Numea / Nouméa)
            _phonoVille: getPhonetics(ville)
        };
    });
    
    console.log(`[Annuaire] ${phoneBook.length} entrées chargées.`);
    
    // Configuration Fuse.js (Moteur de recherche floue)
    if (phoneBook.length > 0) {
        const options = {
            includeScore: true, // Important pour le filtrage intelligent
            keys: [
                { name: '_fullName', weight: 1.0 },
                { name: '_reverseName', weight: 1.0 },
                { name: '_phonoFull', weight: 0.8 },
                { name: '_phonoReverse', weight: 0.8 },
                { name: 'nom', weight: 0.6 },
                { name: '_phonoNom', weight: 0.5 },
                { name: 'telephone', weight: 1.0 }
            ],
            threshold: 0.4, // Tolérance aux fautes (0.0 = strict, 1.0 = tout)
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

        // Est-ce une recherche par numéro ?
        const isPhoneSearch = /^[0-9\s\.\-\+]+$/.test(query);
        let results = [];

        if (isPhoneSearch) {
            // --- A. RECHERCHE PAR TÉLÉPHONE ---
            const cleanNum = query.replace(/[^0-9]/g, '');
            results = phoneBook.filter(entry => {
                const entryNum = (entry.telephone || "").replace(/[^0-9]/g, '');
                return entryNum.includes(cleanNum);
            }).map(item => ({ item, score: 0 })); 

        } else {
            // --- B. RECHERCHE PAR NOM (PUISSANTE) ---
            const queryPhonetic = getPhonetics(query);
            
            // On cherche partout : Texte normal, Texte inversé, Phonétique normale, Phonétique inversée
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

        // --- C. FILTRAGE VILLE INTELLIGENT ---
        // C'est ici qu'on gère le cas "Daniel PETIT à Pouembout (alors qu'il est à Dumbéa)"
        
        if (city && results.length > 0) {
            const normalizedCitySearch = normalize(city);
            const phoneticCitySearch = getPhonetics(city);
            
            // Étape 1 : On isole les résultats qui correspondent à la ville (Texte OU Phonétique)
            const cityMatches = results.filter(res => {
                const entryCity = normalize(res.item.ville);
                const entryCityPhono = res.item._phonoVille; // Champ calculé au chargement
                
                // Comparaison Texte
                const textMatch = entryCity.includes(normalizedCitySearch);
                // Comparaison Phonétique
                const phonoMatch = entryCityPhono && phoneticCitySearch && 
                                   entryCityPhono.includes(phoneticCitySearch);

                return textMatch || phonoMatch;
            });

            // Étape 2 : Analyse de pertinence (Smart Check)
            // On regarde si, parmi les gens de la bonne ville, il y a un "vrai" match de nom.
            // Score Fuse : proche de 0 = très bon match. > 0.4 = mauvais match.
            // Si on trouve un score < 0.3 dans la ville, c'est sûrement la bonne personne.
            const hasStrongMatchInCity = cityMatches.some(res => res.score < 0.35);

            if (hasStrongMatchInCity) {
                // CAS 1 : On a trouvé "Daniel UKEIWE" (Bon Nom, Bonne Ville). 
                // Ou "Daniel PETIT" (Bon Nom, Bonne Ville).
                console.log(`[Tool: Search] Match confirmé à ${city}. Filtrage appliqué.`);
                results = cityMatches;
            } else {
                // CAS 2 : On n'a que des résultats médiocres dans la ville (ex: Daniel UKEIWE score 0.5)
                // alors qu'on a un résultat excellent ailleurs (Daniel PETIT score 0.01).
                // -> On décide d'IGNORER le filtre ville pour montrer le vrai Daniel PETIT.
                console.log(`[Tool: Search] Pas de match convaincant à ${city}. On renvoie les meilleurs résultats globaux.`);
                // On ne modifie pas 'results', on garde le top global.
            }
        }

        // --- D. FORMATAGE ET RETOUR ---
        
        const limitedResults = results.slice(0, 5).map(res => ({
            nom: res.item.nom,
            prenom: res.item.prenom,
            // Formatage vital pour l'IA (66 19 18)
            telephone: formatPhoneNC(res.item.telephone), 
            adresse: res.item.adresse,
            ville: res.item.ville,
            // (Optionnel) On renvoie le score de pertinence pour debug dans les logs IA si besoin
            // pertinence: (1 - res.score).toFixed(2) 
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