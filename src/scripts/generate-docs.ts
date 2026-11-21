import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as fs from 'fs';

async function createDoc(filename:string, title:string, body:string){
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          children: [new TextRun({ text: title, bold: true, size: 32 })],
          heading: 'Heading1',
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: body, size: 24 })],
          spacing: { line: 276 },
        }),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filename, buffer);
  console.log(`✅ ${filename} generated`);
}

(async () => {
  await createDoc('Architecture_et_Table_des_Modules.docx', 'Architecture et Table des Modules', 'Contenu de l\'architecture du projet et la table des modules.');
  await createDoc('NextSteps.docx', 'Next Steps', 'Liste des prochaines étapes à suivre pour le projet.');
})();
