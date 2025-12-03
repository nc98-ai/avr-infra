const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const Fuse = require("fuse.js");
const natural = require("natural");

// On utilise DoubleMetaphone, très efficace pour les noms propres (gère bien Dupont/Dupond, Faivre/Fèvre)
const metaphone = natural.DoubleMetaphone;

let phoneBook = [];
let fuseIndex = null;

const normalize = (str) => {
  if (!str) return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

// Fonction pour obtenir le code phonétique d'une chaine
// Ex: "Faivre" -> "FFR", "Fèvre" -> "FFR"
const getPhonetics = (str) => {
    if (!str) return "";
    const clean = normalize(str);
    // process renvoie un tableau [primary, secondary]. On prend le primary.
    return metaphone.process(clean)[0]; 
};

try {
  const csvPath = path.join(__dirname, "../data/annuaire.csv");
  
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    
    const rawData = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [',', ';', '\t'],
      relax_quotes: true
    });

    // PRÉPARATION DES DONNÉES AVEC PHONÉTIQUE
    phoneBook = rawData.map(entry => {
        const nom = entry.nom || entry.Nom || "";
        const prenom = entry.prenom || entry.Prenom || "";
        
        return {
            ...entry,
            // 1. Textuel complet
            _fullName: `${prenom} ${nom}`,
            _reverseName: `${nom} ${prenom}`,
            
            // 2. Phonétique (C'est ici que la magie opère pour Faivre/Fèvre)
            _phonoNom: getPhonetics(nom),       // Faivre -> FFR
            _phonoPrenom: getPhonetics(prenom), // Jean -> JN
            _phonoFull: getPhonetics(prenom + nom) // JeanFaivre -> JNFFR
        };
    });
    
    console.log(`[Annuaire] ${phoneBook.length} entrées chargées et phonétisées.`);

    if (phoneBook.length > 0) {
        const options = {
            includeScore: true,
            // On cherche maintenant dans le texte ET dans la phonétique
            keys: [
                { name: '_fullName', weight: 1.0 },    // Match exact texte (priorité max)
                { name: '_phonoFull', weight: 0.7 },   // Match phonétique combiné (Faivre/Fèvre)
                { name: 'nom', weight: 0.6 },
                { name: '_phonoNom', weight: 0.5 },    // Phonétique nom seul
                { name: 'telephone', weight: 0.9 }
            ],
            threshold: 0.35, // Un peu plus strict car la phonétique aide déjà beaucoup
            distance: 100,
            ignoreLocation: true
        };
        
        fuseIndex = new Fuse(phoneBook, options);
    }

  } else {
    console.warn(`[Annuaire] Fichier CSV introuvable: ${csvPath}`);
  }
} catch (err) {
  console.error("[Annuaire] Erreur de chargement:", err.message);
}

module.exports = {
  name: "search_contact",
  description: "Recherche un client. Efficace même avec des fautes ou une prononciation approximative (ex: Fèvre pour Faivre).",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Nom, Prénom ou Téléphone."
      },
      city: {
        type: "string",
        description: "Ville (optionnel)."
      }
    },
    required: ["query"],
  },
  handler: async (uuid, { query, city }) => {
    // Si c'est un numéro, on ne fait pas de phonétique
    const isPhoneSearch = /^[0-9\s\.\-\+]+$/.test(query);
    
    console.log(`[Tool: Search] Recherche: "${query}" (PhoneMode: ${isPhoneSearch})`);

    if (!phoneBook.length || !fuseIndex) return "Erreur : Annuaire vide.";

    let results = [];

    if (isPhoneSearch) {
        const cleanNum = query.replace(/[^0-9]/g, '');
        results = phoneBook.filter(entry => {
            const entryNum = (entry.telephone || entry.Telephone || "").replace(/[^0-9]/g, '');
            return entryNum.includes(cleanNum);
        }).map(item => ({ item, score: 0 })); 
    } else {
        // Pour la recherche texte, on cherche :
        // 1. Le texte brut ("Fèvre")
        // 2. OU sa phonétique ("FFR")
        // Fuse.js va gérer ça automatiquement grâce aux clés définies plus haut
        
        // Petite astuce : on peut injecter la phonétique dans la requête Fuse
        // Mais ici, on laisse Fuse faire le lien entre "Fèvre" (input) et "_phonoFull" (index) ? 
        // Non, Fuse compare chaine vs chaine.
        // Donc si l'user tape "Fèvre", on doit aussi chercher le code phonétique de "Fèvre".
        
        const queryPhonetic = getPhonetics(query); // Fèvre -> FFR
        
        // On lance une recherche OR (Texte OU Phonétique)
        results = fuseIndex.search({
            $or: [
                { _fullName: query },      // Cherche "Fèvre" dans les noms écrits
                { _phonoFull: queryPhonetic }, // Cherche "FFR" dans les codes phonétiques
                { _phonoNom: queryPhonetic }   // Cherche "FFR" dans les noms de famille
            ]
        });
    }

    if (city) {
        const normalizedCitySearch = normalize(city);
        results = results.filter(res => {
            const entryCity = normalize(res.item.ville || res.item.Ville || "");
            return entryCity.includes(normalizedCitySearch);
        });
    }

    const limitedResults = results.slice(0, 5).map(res => {
        // On retire les champs techniques (_phono...)
        const { _fullName, _reverseName, _phonoNom, _phonoPrenom, _phonoFull, ...cleanItem } = res.item;
        return cleanItem;
    });

    console.log(`[Tool: Search] ${limitedResults.length} résultats renvoyés.`);

    if (limitedResults.length === 0) {
        return "Aucun résultat trouvé.";
    }

    return JSON.stringify(limitedResults);
  },
};