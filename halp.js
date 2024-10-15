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
    context += `File: ${file.filename}\nContent:\n${file.content}\n\n`;
  });

  const prompt = `
You are an expert Node.js developer. Based on the following project context, perform the instruction provided.

Instruction:
${instruction}

Project Context:
${context}

Provide the updated code for any files that need changes. For each file to be changed, create a block with the following syntax: 

\`\`\`
Filename: <filename>
<updated code>
\`\`\`

Only provide files that have changes. 
Do not wrap code in \`\`\` separate blocks.
Do not provide code comments.
`;

  return prompt;
}

// Function to apply changes from LLM response
function applyChanges(responseText) {
  console.log(responseText)
  const fileSections = responseText.split('```').filter((section) => section.trim());
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

