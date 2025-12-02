# Partir de l'image de base existante
FROM agentvoiceresponse/avr-ami:latest

# Copier uniquement notre fichier modifié pour écraser celui dans l'image
COPY custom/avr-ami/index.js /usr/src/app/index.js
