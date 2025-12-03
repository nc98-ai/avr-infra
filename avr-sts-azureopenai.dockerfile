# Partir de l'image de base
FROM agentvoiceresponse/avr-sts-openai:latest

# Droits root pour nettoyer et installer
USER root

# 1. Configurer npm pour passer le proxy
RUN npm config set strict-ssl false

# 2. Copier vos fichiers personnalisés
COPY custom/avr-sts-azureopenai/index.js /usr/src/app/index.js
COPY custom/avr-sts-azureopenai/avr_tools/avr_hangup.js /usr/src/app/avr_tools/avr_hangup.js
COPY custom/avr-sts-azureopenai/avr_tools/avr_search_contact.js /usr/src/app/avr_tools/search_contact.js
COPY custom/avr-sts-azureopenai/data/annuaire_nc.csv /usr/src/app/data/annuaire.csv

# 3. LE GRAND NETTOYAGE
# On supprime le node_modules existant et le package.json pour repartir de zéro
WORKDIR /usr/src/app
RUN rm -rf node_modules package.json package-lock.json

# 4. On recrée un package.json propre
RUN npm init -y

# 5. On installe TOUTES les dépendances requises (y compris csv-parse)
RUN npm install \
    ws \
    axios \
    dotenv \
    csv-parse \
    fuse.js \
    natural \ 
    @alexanderolsen/libsamplerate-js

# 6. On remet les permissions pour l'utilisateur par défaut 'node'
RUN chown -R node:node /usr/src/app

# (Optionnel) On reste en root si l'image de base a des soucis de droits, 
# sinon on peut décommenter la ligne suivante :
USER node