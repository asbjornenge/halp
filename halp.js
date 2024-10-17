#!/usr/bin/env node
// evaluate.js
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Get the instruction from command-line arguments
const instruction = process.argv.slice(2).join(' ');

if (!instruction) {
  console.error('Please provide an instruction.');
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missiong OPENAI_API_KEY env variable');
  process.exit(1);
}

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to read files and build context
function getProjectContext() {
  const files = [];
  const currentDir = process.cwd();

  // Read all files in the current directory
  const fileNames = fs.readdirSync(currentDir);

  // Filter for .js and .json files
  fileNames.forEach((fileName) => {
    const ext = path.extname(fileName);
    if (ext === '.js' || ext === '.json') {
      const content = fs.readFileSync(path.join(currentDir, fileName), 'utf8');
      files.push({
        filename: fileName,
        content: content,
      });
    }
  });

  return files;
}

// Prepare the prompt
async function buildPrompt(files) {
  let context = '';
  files.forEach((file) => {
    context += `
---
Filename: ${file.filename}
${file.content}
---

`;
  });

  const prompt = `
You are an expert Node.js and JavaScript developer.

**Important Instructions**:
- **Provide the full code for any files that you create or modify.**
- **Only provide files that have changes.**
- **Do NOT wrap code in \`\`\` blocks.**
- **Follow the code style and structure of the provided context**
- **Do not add any new comments.**
- **Preserve all existing code comments exactly as they are. Do not remove any comments from the original code.**

Based on the following project context, perform the instruction provided.

Instruction:
${instruction}

Project Context:
${context}

For each file to be changed or created, create a block with the exact following syntax:

---
Filename: <filename>
<updated code>
---
`;

//  const prompt = `
//You are an expert Node.js developer. Based on the following project context, perform the instruction provided.
//
//Instruction:
//${instruction}
//
//Project Context:
//${context}
//
//For each file to be changed, create a block with the following syntax: 
//
//---
//Filename: <filename>
//<updated code>
//---
//
//Provide the full code for any files that you create or modify. 
//Only provide files that have changes.
//You must NOT wrap code in \`\`\` blocks.
//Keep my code comments intact, but don't add any new comments in your modifications or when creating new code.
//`;

  return prompt;
}

// Function to apply changes from LLM response
function applyChanges(responseText) {
  console.log(responseText)
  const fileSections = responseText.split('---').filter((section) => section.trim());
  fileSections.forEach((section) => {
    const lines = section.split('\n');
    const filenameLine = lines[1];
    const filenameMatch = filenameLine.match(/Filename:\s*(.+)/);

    if (filenameMatch) {
      const filename = filenameMatch[1].trim();
      const content = lines.slice(2).join('\n');
      fs.writeFileSync(filename, content, 'utf8');
      console.log(`Updated ${filename}`);
    }
  });
}

// Main function to run the script
(async () => {
  try {
    const files = getProjectContext();
    const prompt = await buildPrompt(files);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // or 'gpt-3.5-turbo' if you prefer
      messages: [{ role: 'user', content: prompt }],
    });

    const result = response.choices[0].message.content;
    applyChanges(result);

    console.log('Changes applied. Use git diff to review them.');
  } catch (error) {
    console.error('Error:', error);
  }
})();

