const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

// Fonction utilitaire pour normaliser (minuscule + sans accents)
const normalize = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Enlève les accents
    .trim();
};

let phoneBook = [];

try {
  const csvPath = path.join(__dirname, "../data/annuaire.csv"); // Attention au chemin dans le conteneur
  
  if (fs.existsSync(csvPath)) {
    const fileContent = fs.readFileSync(csvPath, "utf-8");
    
    // CORRECTION 1 : Support du point-virgule (fréquent en NC/FR)
    phoneBook = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter: [',', ';', '\t'], // Accepte virgule, point-virgule ou tabulation
      relax_quotes: true
    });
    
    console.log(`[Annuaire] ${phoneBook.length} entrées chargées.`);
    // DEBUG : Affiche la première ligne pour vérifier que les colonnes sont bien lues
    if (phoneBook.length > 0) {
        console.log("[Annuaire] Exemple de ligne chargée :", JSON.stringify(phoneBook[0]));
    }

  } else {
    console.warn(`[Annuaire] Fichier CSV introuvable: ${csvPath}`);
  }
} catch (err) {
  console.error("[Annuaire] Erreur de chargement:", err.message);
}

module.exports = {
  name: "search_contact",
  description: "Recherche un client dans l'annuaire. Utiliser pour trouver un numéro de téléphone ou une adresse.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Nom et/ou Prénom, ou numéro de téléphone (ex: 'Malia Faivre', '640612')."
      },
      city: {
        type: "string",
        description: "Ville pour filtrer (optionnel)."
      }
    },
    required: ["query"],
  },
  handler: async (uuid, { query, city }) => {
    console.log(`[Tool: Search] Recherche brute: "${query}" (Ville: ${city || "Toutes"})`);

    if (!phoneBook.length) return "Erreur : Annuaire vide.";

    const cleanQuery = normalize(query);
    const cleanCity = normalize(city);
    
    // Détection si c'est un numéro de téléphone (contient des chiffres)
    const isPhoneSearch = /[0-9]/.test(cleanQuery); 

    const results = phoneBook.filter(entry => {
      // Normalisation des données CSV
      // Adaptez les clés ici si votre CSV a des entêtes différents (ex: "Nom Client" au lieu de "nom")
      const nom = normalize(entry.nom || entry.Nom || entry.NOM || "");
      const prenom = normalize(entry.prenom || entry.Prenom || entry.PRENOM || "");
      const ville = normalize(entry.ville || entry.Ville || entry.VILLE || "");
      const tel = normalize(entry.telephone || entry.Telephone || entry.TELEPHONE || "");
      const adresse = normalize(entry.adresse || entry.Adresse || "");

      // CORRECTION 2 : Création d'une chaîne complète pour la recherche
      // Cela permet de trouver "Malia Faivre" dans "nom: Faivre, prenom: Malia"
      const fullNameDirect = `${prenom} ${nom}`;  // "malia faivre"
      const fullNameReverse = `${nom} ${prenom}`; // "faivre malia"

      let match = false;

      if (isPhoneSearch) {
        // Recherche par numéro (en enlevant les espaces)
        const queryNums = cleanQuery.replace(/\s/g, "");
        const entryNums = tel.replace(/\s/g, "");
        if (entryNums.includes(queryNums)) match = true;
      } else {
        // Recherche textuelle intelligente
        // 1. Est-ce que la requête est dans le nom ?
        // 2. Est-ce que la requête est dans le prénom ?
        // 3. Est-ce que la requête correspond à "Prénom Nom" ?
        if (
             nom.includes(cleanQuery) || 
             prenom.includes(cleanQuery) ||
             fullNameDirect.includes(cleanQuery) ||
             fullNameReverse.includes(cleanQuery)
           ) {
          match = true;
        }
      }

      // Filtre Ville (si demandée)
      if (match && cleanCity) {
        // On accepte si la ville contient la recherche (ex: "Noumea" trouve "Nouméa")
        if (!ville.includes(cleanCity)) match = false;
      }

      return match;
    });

    const limitedResults = results.slice(0, 5);
    console.log(`[Tool: Search] ${results.length} trouvés, ${limitedResults.length} renvoyés.`);

    if (limitedResults.length === 0) {
      return "Aucun résultat trouvé. Demandez à l'utilisateur de vérifier l'orthographe.";
    }

    return JSON.stringify(limitedResults);
  },
};