#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import minimist from 'minimist'
import { glob } from 'glob'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = minimist(process.argv.slice(2), {
  boolean: ['d','v'],
  alias: { 
    d: 'dry', 
    h: 'help',
    m: 'model',
    s: 'silent',
    c: 'context',
    v: 'version',
    r: 'recursive'
  },
  default: {
    d: false,
    v: false,
    h: false,
    m: 'gpt-4o-mini',
    s: false,
    c: '*.js,package.json',
    r: false
  }
})


if (args.version) {
  const pkgjson = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8');
  console.log(`Version: ${JSON.parse(pkgjson).version}`);
  process.exit(0);
}

if (args.help) {
  const readmeContent = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf-8');
  const usageSection = readmeContent.match(/## Usage[\s\S]*?```([\s\S]*?)```/);
  console.log(usageSection[1].trim());
  process.exit(0)
}

const instruction = args._[0]

if (!instruction) {
  console.error('Please provide an instruction.')
  process.exit(1)
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Missiong OPENAI_API_KEY env variable')
  process.exit(1)
}

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

function getProjectContext() {
  const files = [];
  const currentDir = process.cwd();
  const contextFiles = args.c.split(',').map(file => file.trim());

  contextFiles.forEach((pattern) => {
    // Use glob to find files matching the pattern
    const filePaths = glob.sync(pattern, {
      cwd: currentDir,
      nodir: true,      // Exclude directories
      dot: false,       // Exclude files starting with a dot
      absolute: true,   // Return absolute paths
    });

    filePaths.forEach((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      files.push({
        filename: path.relative(currentDir, filePath), // Relative path from current directory
        content: content,
      });
    });
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
- **It is absolutely essential that you provide the entire file for any files that you change or create.**
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
  return prompt;
}

// Function to apply changes from LLM response
function applyChanges(responseText) {
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
      model: args.m, 
      messages: [{ role: 'user', content: prompt }],
    });

    const result = response.choices[0].message.content;
    if (!args.s) console.log(result)
    if (!args.d) { 
      applyChanges(result)
      console.log('Changes applied. Use git diff to review them.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
})();

