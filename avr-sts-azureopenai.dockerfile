# Partir de l'image de base existante
FROM agentvoiceresponse/avr-sts-openai:latest

# Copier uniquement notre fichier modifié pour écraser celui dans l'image
COPY custom/avr-sts-azureopenai/index.js /usr/src/app/index.js
COPY custom/avr-sts-azureopenai/avr_tools/avr_hangup.js /usr/src/app/avr_tools/avr_hangup.js

