import pandas as pd
import numpy as np

# 1. Lecture du fichier
df = pd.read_csv('exclu/annuaire_annuaire_recherche_avancee.csv', sep=';')

# 2. Filtrage : Supprimer les lignes où liste_rouge est 'True'
df = df[df['liste_rouge'].astype(str).str.lower() != 'true']

# --- ÉTAPE : CRÉATION COLONNE PARTICULIER ---
segments_particuliers = ['Résidentiel', 'Employé OPT', 'Grand Public']
df['Particulier'] = np.where(df['segment'].isin(segments_particuliers), 'true', 'false')

# --- BLOC : PROPAGATION DU NOM PAR NUMERO CLIENT ---
df['nom'] = df['nom'].replace('', np.nan)
mask_nom_manquant_avant = df['nom'].isna()

noms_propages = df.groupby('numero_client')['nom'].transform('first')
df['nom'] = df['nom'].fillna(noms_propages)

noms_recuperes = df.loc[mask_nom_manquant_avant & df['nom'].notna(), 'nom'].unique()

# Fallback designation_tri
df['nom'] = df['nom'].fillna(df['designation_tri'])

# --- NOUVEAU BLOC : PROPAGATION DE LA RUBRIQUE (libelle_rubrique) ---
# 1. On s'assure que les vides sont des NaN
df['libelle_rubrique'] = df['libelle_rubrique'].replace('', np.nan)
mask_rubrique_manquante = df['libelle_rubrique'].isna()

# 2. On groupe par client et on prend la première rubrique non vide trouvée
rubriques_propagees = df.groupby('numero_client')['libelle_rubrique'].transform('first')
df['libelle_rubrique'] = df['libelle_rubrique'].fillna(rubriques_propagees)

# 3. Stats pour vérification
nb_rubriques_recup = df.loc[mask_rubrique_manquante & df['libelle_rubrique'].notna()].shape[0]
# --------------------------------------------------------------------

# 3. Remplacement des valeurs dans la colonne 'techno'
df['techno'] = df['techno'].replace(['TELEPHONE', 'GSMFIXE'], 'FIXE')

# 4. Renommage des colonnes
mapping_colonnes = {
    'nom': 'Nom',
    'prenom': 'Prenom',
    'numero_appel': 'Telephone',
    'libelle_commune': 'Ville',
    'adresse_inscription': 'Adresse',
    'techno': 'Type_telephone',
    'boite_postale': 'BP',
    'libelle_rubrique': 'Rubrique' # <--- J'ai ajouté ceci pour garder la colonne
}

df = df.rename(columns=mapping_colonnes)

# 5. Sélection finale des colonnes
# J'ai ajouté 'Rubrique' à la liste pour qu'elle apparaisse dans le CSV final
colonnes_a_garder = ['Nom', 'Prenom', 'Telephone', 'Ville', 'Adresse', 'Type_telephone', 'Particulier', 'BP', 'Rubrique']
df = df[colonnes_a_garder]

# 6. Affichage pour vérification
print("Colonnes finales :", df.columns.tolist())
print("-" * 30)
print(f"Noms récupérés via ID client : {len(noms_recuperes)}")
print(f"Rubriques récupérées via ID client : {nb_rubriques_recup}") # Info ajoutée
print("-" * 30)
print("Aperçu de la colonne Particulier :")
print(df['Particulier'].value_counts())

# 7. Sauvegarde
df.to_csv('exclu/annuaire_nc.csv', sep=';', index=False)