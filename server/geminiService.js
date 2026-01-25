const { GoogleGenerativeAI } = require("@google/generative-ai");

const topicContext = {
    'java': 'Core Java logic/syntax. FOR QUESTIONS 1-20: Focus on VERY BASIC logic: Simple loops, basic array handling, string operations (reversing, char count), if-else logic. FOR QUESTIONS 21+: OOP (Encapsulation, Inheritance, Abstraction, Interface), Polymorphism types (compile/runtime), method Overloading/Overriding, Constructors, Garbage Collection, Exception handling (try-catch, throw vs throws, finally), RunTime vs CompileTime Errors, final keyword, Java 8 Features, Generics, Collections (HashMap vs HashSet, ArrayList vs LinkedList), Binary Search/Algorithms, Strings/Arrays algorithms (Reverse, find missing/duplicates, largest/smallest).',
    'selenium': 'Selenium WebDriver in JAVA ONLY. FOR QUESTIONS 1-20: Focus heavily on FINDING ELEMENTS: ID, name, className, and Basic XPath/CSS selectors. FOR QUESTIONS 21+: Selenium 3 vs 4, WebDriver Interface, firefox/chrome usage, Locators (dynamic XPath/CSS), findElement vs findElements, Waits (Implicit/Explicit/Fluent), Thread.sleep vs wait, popups/alerts/windows handling, StaleElementReferenceException, Actions class, Shadow DOM, selectByVisibleText/Index/Value, Screenshot capture, JavaScriptExecutor alternatives to sendKeys, Apache POI (POI Read/Write, Workbook/Sheet/Row/Cell), Framework Design (POM, Page Factory). NO PYTHON.',
    'sql': 'Relational SQL. FOR QUESTIONS 1-20: Strictly BASIC DDL (CREATE, ALTER) and DML (INSERT, UPDATE, DELETE, simple SELECT) & basics like Primary vs Unique Key. FOR QUESTIONS 21+: Multi-table JOINS (Inner, Left, Right, Full), Subqueries (Nth highest salary logic), Aggregate functions (SUM, COUNT, etc.), filters (age > 50, etc.). JDBC Context: Connection interface, PreparedStatements, DB connection protocols, handling connection leaks (closing connections).',
    'functional': 'Manual testing concepts. SDLC/STLC models (Waterfall vs Agile), Bug life cycle (Status flow, owner), Regression vs Retesting, Smoke vs Sanity, Functional vs Non-functional (Performance, Stress vs Load, Accessibility), Levels of Testing (Unit, Integration, System, UAT), UAT execution, Defect management tools, Test scenario vs Case, Test Design Techniques, Test Plan contents.',
    'poi': 'Apache POI for Excel Read/Write. OPERATIONS: Workbook/Sheet/Row/Cell handling, XLSX/XLS difference. POM: Dependency configuration. Data-driven testing integration with Selenium.',
    'testng': 'TestNG Framework. SYLLABUS: Annotations (@Test, @Before/After Suite/Test/Class/Method), Assertions (Hard vs Soft), Data Driven (@DataProvider, XML), Parallel/Multi-browser execution, Failed test rerun, Test priority/dependencies, dependsOnMethods, testng.xml (Groups, Parameters), POM integration.'
};

let genAI = null;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function generateQuestion(topic, type, existingCount, existingData = []) {
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing from .env");
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"; // Strict requirement: gemini-2.5-flash
    const model = genAI.getGenerativeModel({ model: modelName });
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
        ${type === 'quiz' ? `Task: Unique MCQ for Question #${unitNumber}. Start from absolute BEDROCK basics if index is 1-20. 
        CRITICAL FOR MCQs: If the question asks for the "output" or "result" of a code snippet, YOU MUST INCLUDE THE CODE SNIPPET inside the "question" field using markdown backticks (e.g. \`\`\`java \\n [CODE HERE] \\n \`\`\`).` : `Task: Unique Code Snippet Challenge for Question #${unitNumber}. Focus on basic constructs if index is 1-20.`}
        History (Do NOT repeat anything similar to these): ${type === 'quiz' ? existingData.map(q => q.question).slice(-15).join('|') : existingData.map(q => q.title).slice(-15).join('|')}
        
        CRITICAL: The generated ${type === 'quiz' ? 'question' : 'challenge'} must be completely distinct from the history provided above in both concept and wording.
        
        CRITICAL FOR SELENIUM: USE JAVA LANGUAGE ONLY. NEVER USE PYTHON.
        
        JSON Schema:
        ${type === 'quiz' ?
            `{"id":${unitNumber},"question":"str","options":["4 str"],"answer":0-3,"explanation":"brief str"}` :
            `{"id":${unitNumber},"title":"str","description":"brief str with site URL if selenium","template":"snippet str"}`}
        
        CRITICAL FOR CODE CHALLENGES: The "template" field MUST ONLY contain EMPTY boilerplate (method signatures, class headers). NEVER include solution logic or clues in the template. If the user needs to write a function, just provide the signature and a // TODO comment. 
        Return ONLY raw JSON. No markdown.
    `;

    let lastError = null;
    for (let i = 0; i < 3; i++) {
        try {
            const result = await model.generateContent(prompt);
            let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
            return JSON.parse(text);
        } catch (error) {
            lastError = error;
            console.error(`[Gemini] Attempt ${i + 1} failed:`, error.message);
            if (error.message.includes('503') || error.message.includes('overloaded') || error.message.includes('Service Unavailable')) {
                const waitTime = Math.pow(2, i) * 1500;
                console.log(`[Gemini] Service overloaded. Retrying in ${waitTime}ms...`);
                await delay(waitTime);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
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
