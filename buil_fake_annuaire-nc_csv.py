import csv
import random

# Configuration
FILENAME = "annuaire_nc.csv"
NB_LIGNES = 200000

# Données contextuelles (Nouvelle-Calédonie)
# Mélange de noms d'origines diverses présentes en NC (Kanak, Européen, Océanien, Asiatique)
noms_famille = [
    # Kanak
    "WAMYTAN", "MAPOU", "NEAOUTYINE", "TJIBAOU", "XOWIE", "POADJA", "NAISSELINE", "TEIN", "GOA",
    "UKEIWE", "IWA", "KAUMA", "BOUANAOUE", "WAKANUMUNE", "GORODEY", "BOA", "WASHETINE", "NEPORO",
    "QAEZE", "WENDT", "DIKE", "HNAEJE", "DOOI", "TIARE", "MOLALA", "NONMEU", "WADRAWANE", "ZONGO",
    # Européen / Caldoche
    "LAFLEUR", "FROGIER", "METZDORF", "MARTIN", "BERNARD", "THOMAS", "PETIT", "ROBERT", "RICHARD",
    "DURAND", "DUBOIS", "MOREAU", "LAURENT", "SIMON", "MICHEL", "LEFEBVRE", "LEROY", "ROUX", "DAVID",
    "BERTRAND", "ROUGERIE", "DALY", "HAGEN", "PENTAENIUS", "BOUTIN", "MERCIER", "GERMAIN", "LEMOINE",
    "FAIVRE", "ROLLAND", "GAILLARD", "BARBIER", "ARNAUD", "GIRAUD", "FABRE", "BLANC", "GUERIN",
    # Wallisien / Futunien / Tahitien
    "SIONE", "TUI", "FIAFIALOTO", "KULIMOETOKE", "LIKAFIA", "MANUKA", "SIAPO", "VAKAUTA", "TEHEIURA",
    "FAUA", "LOLOHEA", "TULITAU", "SOSEFO", "VEA", "MAFILEO", "TUFELE", "UHILA", "KOLIVAI", "FATUPUA",
    # Asiatique / Autres
    "NGUYEN", "TRAN", "DANG", "PHAM", "LE", "VO", "WONG", "LEE", "SALIGH", "HASSAN", "ALI", "ROJO"
]

prenoms = [
    "Jean", "Marie", "Jacques", "Wary", "Isée", "Sonia", "Philippe", "Rock", "Louis", 
    "Suzanne", "Soane", "Malia", "Pierre", "Kowi", "Yeiwene", "Denise", "Raymonde", 
    "Seleone", "Steeve", "Alphonse", "Kue", "Lydie", "Nicolas", "Thomas", "Sarah", 
    "Elodie", "Franck", "Mikaël", "Océane", "Paul", "Nathalie", "Michel", "Isabelle",
    "Alain", "Sylvie", "Patrick", "Catherine", "Stéphane", "Véronique", "David",
    "Christine", "Daniel", "Martine", "Laurent", "Valérie", "Christophe", "Sandrine",
    "Pascal", "Sophie", "Eric", "Céline", "Olivier", "Chantal", "Thierry", "Béatrice",
    "Gilles", "Aurélie", "François", "Monique", "Bernard", "Caroline", "Frédéric",
    "Anne", "Didier", "Nicole", "Christian", "Julie", "Bruno", "Laurence", "Marc",
    "Virginie", "Jérôme", "Emilie", "Guillaume", "Karine", "Alexandre", "Stéphanie",
    "Julien", "Françoise", "Vincent", "Camille", "Sébastien", "Dominique", "Arnaud",
    "Corinne", "Claude", "Elise", "Lucas", "Léa", "Enzo", "Manon", "Nathan", "Chloé",
    "Mathis", "Emma", "Gabriel", "Jade", "Ethan", "Lola", "Noah", "Inès", "Raphaël",
    "Clara", "Yanis", "Louna", "Hugo", "Mia", "Arthur", "Zoé", "Théo", "Alice",
    "Jules", "Louise", "Maël", "Juliette", "Tom", "Léna", "Clément", "Eva", "Maxime",
    "Nina", "Antoine", "Anaïs", "Mathéo", "Romane", "Pauline", "Léo", "Lucie", "Axel",
    "Jeanne", "Baptiste", "Agathe", "Alexis", "Charlotte", "Valentin", "Margaux",
    "Romain", "Mathilde", "Florian", "Justine", "Dimitri", "Ophélie", "Loïc", "Marion",
    "Kevin", "Morgane", "Anthony", "Laura", "Adrien", "Amandine", "Benjamin", "Mélanie",
    "Cédric", "Audrey", "Damien", "Alexandra", "Grégory", "Elodie", "Matthieu", "Jessica",
    "Fabien", "Laetitia", "Ludovic", "Magali", "Jérémy", "Vanessa", "Arnaud", "Delphine",
    "Waimo", "Iene", "Hnawia", "Wadrane", "Xan", "Yamel", "Drehu", "Nengone", "Tokanod",
    "Sosefo", "Pelenato", "Mose", "Paulo", "Lavelua", "Sose", "Kalala", "Sefo", "Tino",
    "Vito", "Petelo", "Mikaele", "Lino", "Savelio", "Falakika", "Atelemo", "Epifano",
    "Sipiliano", "Valelio", "Setefano", "Lolesio", "Polikalepo", "Kikiforo", "Telesia",
    "Ana", "Maria", "Losa", "Sofia", "Vaimalama", "Hinatea", "Moana", "Teiva", "Manua",
    "Ariii", "Teva", "Maeva", "Heifara", "Roimata", "Vaitea", "Titouan", "Moe", "Hina",
    "Poema", "Here", "Vahine", "Tiare", "Marama", "Fetia", "Reva", "Noa", "Tehani",
    "Kaï", "Kilian", "Nolan", "Timéo", "Mahé", "Malo", "Naël", "Soan", "Liam", "Milo"
]

villes = [
    "Nouméa", "Dumbéa", "Païta", "Le Mont-Dore", "Koné", "Bourail", 
    "Poindimié", "Koumac", "Lifou", "Maré", "Ouvéa", "Yaté", "Thio", 
    "La Foa", "Boulouparis", "Voh", "Pouembout", "Hienghène"
]

types_voies = ["Rue", "Avenue", "Route", "Impasse", "Chemin", "Promenade"]
noms_voies = [
    "de la Plage", "du Général de Gaulle", "des Cocotiers", "de la Vallée", 
    "Anova", "de la Baie", "de l'Anse Vata", "de Sébastopol", "de la Victoire",
    "Pasteur", "Bénébig", "Tuband", "du Ouen Toro", "de la Tribu", "Mangine"
]

def generer_telephone():
    # Génère un numéro à 6 chiffres (Format NC)
    # Les fixes commencent souvent par 2, 3, 4 et les mobiles par 7, 8, 9
    # Pour simplifier, on prend un nombre aléatoire entre 200000 et 999999
    return str(random.randint(200000, 999999))

def generer_adresse():
    numero = random.randint(1, 150)
    type_v = random.choice(types_voies)
    nom_v = random.choice(noms_voies)
    return f"{numero} {type_v} {nom_v}"

print(f"Génération de {NB_LIGNES} lignes en cours...")

with open(FILENAME, mode='w', newline='', encoding='utf-8') as file:
    writer = csv.writer(file, delimiter=';') # Utilisation du point-virgule comme séparateur standard
    
    # En-tête
    writer.writerow(["Nom", "Prenom", "Telephone", "Adresse", "Ville"])
    
    for _ in range(NB_LIGNES):
        nom = random.choice(noms_famille)
        prenom = random.choice(prenoms)
        telephone = generer_telephone()
        adresse = generer_adresse()
        ville = random.choice(villes)
        
        writer.writerow([nom, prenom, telephone, adresse, ville])

print(f"Fichier '{FILENAME}' créé avec succès !")