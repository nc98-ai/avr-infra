import csv
import random

# Configuration
FILENAME = "annuaire_nc.csv"
NB_LIGNES = 20000

# Données contextuelles (Nouvelle-Calédonie)
# Mélange de noms d'origines diverses présentes en NC (Kanak, Européen, Océanien, Asiatique)
noms_famille = [
    "WAMYTAN", "LAFLEUR", "MARTIN", "GOMES", "NEOUTYINE", "MAPOU", "FROGIER", 
    "DANG", "TJIBAOU", "UKEIWE", "METZDORF", "BOUTIN", "SIONE", "FAIVRE",
    "POADJA", "NAISSELINE", "XAWIE", "IWE", "GERMAIN", "MERCIER", "LEMOINE",
    "BOUTEILLER", "TUI", "FIAFIALOTO", "NGUYEN", "MICHEL", "BERNIER", "ROJO",
    "KAMO", "GOA", "QAEZE", "WENDT", "SAMINADIN", "ROLLAND", "TEIN","FAFIN", "TOURTE"
]

prenoms = [
    "Jean", "Marie", "Jacques", "Wary", "Isée", "Sonia", "Philippe", "Rock", 
    "Louis", "Suzanne", "Soane", "Malia", "Pierre", "Kowi", "Yeiwene", 
    "Denise", "Raymonde", "Seleone", "Steeve", "Alphonse", "Kue", "Lydie",
    "Nicolas", "Thomas", "Sarah", "Elodie", "Franck", "Mikaël", "Océane"
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