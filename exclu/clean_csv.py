import pandas as pd
import numpy as np

# 1. Lecture du fichier
df = pd.read_csv('exclu/annuaire_annuaire_recherche_avancee.csv', sep=';')

# 2. Filtrage : Supprimer les lignes où liste_rouge est 'True'
df = df[df['liste_rouge'].astype(str).str.lower() != 'true']

# --- NOUVELLE ÉTAPE : CRÉATION COLONNE PARTICULIER ---
# On définit la liste des segments considérés comme "Particulier"
segments_particuliers = ['Résidentiel', 'Employé OPT', 'Grand Public']

# On utilise np.where(condition, valeur_si_vrai, valeur_si_faux)
# Si 'segment' est dans la liste -> 'true', sinon -> 'false'
df['Particulier'] = np.where(df['segment'].isin(segments_particuliers), 'true', 'false')
# -----------------------------------------------------

# --- BLOC : PROPAGATION DU NOM PAR NUMERO CLIENT ---
df['nom'] = df['nom'].replace('', np.nan)
mask_manquant_avant = df['nom'].isna()

# On propage le nom trouvé sur le même numéro de client
noms_propages = df.groupby('numero_client')['nom'].transform('first')
df['nom'] = df['nom'].fillna(noms_propages)

# On repère les noms qui ont été sauvés par cette méthode
noms_recuperes = df.loc[mask_manquant_avant & df['nom'].notna(), 'nom'].unique()

# (Fallback) Si toujours vide, on utilise designation_tri
df['nom'] = df['nom'].fillna(df['designation_tri'])
# ---------------------------------------------------

# 3. Remplacement des valeurs dans la colonne 'techno'
df['techno'] = df['techno'].replace(['TELEPHONE', 'GSMFIXE'], 'FIXE')

# 4. Renommage des colonnes
mapping_colonnes = {
    'nom': 'Nom',
    'prenom': 'Prenom',
    'numero_appel': 'Telephone',
    'libelle_commune': 'Ville',
    'adresse_inscription': 'Adresse',
    'techno': 'Type_telephone'
    # 'Particulier' est déjà bien nommé, on ne le touche pas
}

df = df.rename(columns=mapping_colonnes)

# 5. Sélection finale des colonnes
# IMPORTANT : J'ai ajouté 'Particulier' à cette liste pour le conserver
colonnes_a_garder = ['Nom', 'Prenom', 'Telephone', 'Ville', 'Adresse', 'Type_telephone', 'Particulier']
df = df[colonnes_a_garder]

# 6. Affichage pour vérification
print("Colonnes finales :", df.columns.tolist())
print("-" * 30)
print(f"Nombre de noms récupérés via le numéro de client : {len(noms_recuperes)}")
if len(noms_recuperes) > 0:
    print("Exemples de noms ajoutés :", noms_recuperes[:5]) # Affiche les 5 premiers
print("-" * 30)
print("Aperçu de la colonne Particulier :")
print(df['Particulier'].value_counts()) # Affiche combien de true/false

# 7. Sauvegarde
df.to_csv('exclu/annuaire_nc.csv', sep=';', index=False)