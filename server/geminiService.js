const { GoogleGenerativeAI } = require("@google/generative-ai");

const topicContext = {
    'java': 'Core Java logic/syntax. FOR QUESTIONS 1-20: Focus on VERY BASIC logic: Simple loops, basic array handling, string operations (reversing, char count), if-else logic. FOR QUESTIONS 21+: Progress to OOP, Collections, and Exception handling.',
    'selenium': 'Selenium WebDriver in JAVA ONLY. FOR QUESTIONS 1-20: Focus heavily on FINDING ELEMENTS: ID, name, className, and Basic XPath/CSS selectors. Use sites like https://the-internet.herokuapp.com. SNIPPETS ONLY. NO PYTHON.',
    'sql': 'Relational SQL. FOR QUESTIONS 1-20: Strictly BASIC DDL (CREATE, ALTER) and DML (INSERT, UPDATE, DELETE, simple SELECT). NO JOINS OR SUBQUERIES until Question 21+.'
};

let genAI = null;

async function generateQuestion(topic, type, existingCount, existingData = []) {
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing from .env");
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });
    const context = topicContext[topic] || topic;
    const unitNumber = existingCount + 1;

    // Scale difficulty based on question number
    let difficulty = "Mid-level/Intermediate";
    if (unitNumber <= 10) difficulty = "Bedrock Basics/Absolute Beginner";
    else if (unitNumber <= 20) difficulty = "Foundational Core/Elementary";
    else difficulty = "Standard/Advanced Level";

    let prompt = `
        System: You are Interimate AI. No bluff, answer only what is needed. NO UNNECESSARY COMMENTS.
        Target Difficulty: ${difficulty} (Question #${unitNumber}). 
        Topic: ${topic} (${context}).
        ${type === 'quiz' ? `Task: Unique MCQ for Question #${unitNumber}. Start from absolute BEDROCK basics if index is 1-20.` : `Task: Unique Code Snippet Challenge for Question #${unitNumber}. Focus on basic constructs if index is 1-20.`}
        Prev: ${type === 'quiz' ? existingData.map(q => q.question).slice(-5).join('|') : existingData.map(q => q.title).slice(-5).join('|')}
        
        CRITICAL FOR SELENIUM: USE JAVA LANGUAGE ONLY. NEVER USE PYTHON.
        
        JSON Schema:
        ${type === 'quiz' ?
            `{"id":${unitNumber},"question":"str","options":["4 str"],"answer":0-3,"explanation":"brief str"}` :
            `{"id":${unitNumber},"title":"str","description":"brief str with site URL if selenium","template":"snippet str"}`}
        
        CRITICAL FOR CODE CHALLENGES: The "template" field MUST ONLY contain EMPTY boilerplate (method signatures, class headers). NEVER include solution logic or clues in the template. If the user needs to write a function, just provide the signature and a // TODO comment. 
        Return ONLY raw JSON. No markdown.
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[Gemini] Generation Error:", error.message);
        throw error;
    }
}

async function validateCode(topic, title, description, userCode) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `
        System: You are a strict technical interviewer but lenient on minor typos. 
        Topic: ${topic}
        Challenge: ${title}
        Task: ${description}
        User Code:
        ${userCode}

        Task: Evaluate the code.
        - If CORRECT: feedback MUST be 1 sentence only.
        - If INCORRECT: feedback MUST be a brief 1-sentence explanation followed by the solution prefixed with "FIX: ".
        
        FIX STRUCTURE:
        * FOR SQL: Provide the COMPLETE correct query, well-formatted with newlines.
        * FOR JAVA/SELENIUM: Provide the specific code snippet, well-structured and indented. 
        
        CRITICAL: Ignore minor typos like casing or pluralization if logic is sound.
        Return JSON: {"isCorrect": boolean, "feedback": "straight on point str"}
        NO BLUFF. No markdown blocks in feedback.
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[Gemini] Validation Error:", error.message);
        return { isCorrect: false, feedback: "AI Validation failed. Technical error in engine." };
    }
}

module.exports = { generateQuestion, validateCode };
