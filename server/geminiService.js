const { GoogleGenerativeAI } = require("@google/generative-ai");

const checkpointBlueprint = {
    'java': [
        { range: [1, 10], subtopic: 'Bedrock Syntax, Variables, and Basic Data Types', difficulty: 'Absolute Beginner' },
        { range: [11, 25], subtopic: 'OOP Basics: Classes, Objects, and Methods', difficulty: 'Beginner' },
        { range: [26, 40], subtopic: 'Advanced OOP: Inheritance, Polymorphism, Abstraction, Interfaces', difficulty: 'Intermediate' },
        { range: [41, 55], subtopic: 'Memory Management, Garbage Collection, and Constructors', difficulty: 'Intermediate' },
        { range: [56, 70], subtopic: 'Exception Handling: try-catch, throw vs throws, finally', difficulty: 'Advanced' },
        { range: [71, 85], subtopic: 'Java Collections Framework: Map, Set, List implementations', difficulty: 'Advanced' },
        { range: [86, 100], subtopic: 'Java 8 Features (Lambdas/Streams) and Complex Algorithms', difficulty: 'Expert' }
    ],
    'selenium': [
        { range: [1, 15], subtopic: 'Architecture and Basic Locators (ID, LinkText, Name)', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'Advanced Selectors (Dynamic XPath and CSS Selectors)', difficulty: 'Intermediate' },
        { range: [36, 55], subtopic: 'Synchronization: Implicit, Explicit, and Fluent Waits', difficulty: 'Intermediate' },
        { range: [56, 75], subtopic: 'Advanced Interactions: JavaScriptExecutor, Actions Class, Shadow DOM', difficulty: 'Advanced' },
        { range: [76, 100], subtopic: 'Framework Design: Page Object Model (POM) and Page Factory', difficulty: 'Expert' }
    ],
    'sql': [
        { range: [1, 15], subtopic: 'DDL (CREATE/ALTER) and DML (INSERT/UPDATE/DELETE) Basics', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'Data Constraints (Primary/Foreign Keys) and Basic Filtering', difficulty: 'Beginner' },
        { range: [36, 60], subtopic: 'Aggregations and Relational Joins (Inner, Left, Right, Full)', difficulty: 'Intermediate' },
        { range: [61, 80], subtopic: 'Subqueries: Correlated and Non-correlated (Nth Salary logic)', difficulty: 'Advanced' },
        { range: [81, 100], subtopic: 'JDBC Integration and Transaction Management', difficulty: 'Expert' }
    ],
    'functional': [
        { range: [1, 20], subtopic: 'SDLC and STLC Lifecycles (Waterfall vs Agile)', difficulty: 'Absolute Beginner' },
        { range: [21, 45], subtopic: 'Functional vs Non-Functional Testing and Testing Levels', difficulty: 'Intermediate' },
        { range: [46, 70], subtopic: 'Defect Management Lifecycle, Severity vs Priority', difficulty: 'Advanced' },
        { range: [71, 100], subtopic: 'UAT, Agile ceremonies, and Test Strategy Design', difficulty: 'Expert' }
    ],
    'testng': [
        { range: [1, 15], subtopic: 'Annotations (@Test, @Before/After) and priority', difficulty: 'Beginner' },
        { range: [16, 30], subtopic: 'Assertions (Hard vs Soft) and testng.xml grouping', difficulty: 'Intermediate' },
        { range: [31, 50], subtopic: 'Data-Driven Testing (@DataProvider) and Parallel Execution', difficulty: 'Advanced' }
    ],
    'poi': [
        { range: [1, 25], subtopic: 'Workbook, Sheet, Row, and Cell handling basics', difficulty: 'Intermediate' },
        { range: [26, 50], subtopic: 'Advanced Data-Driven Framework integration with Selenium', difficulty: 'Advanced' }
    ]
};

let genAI = null;
const delay = ms => new Promise(res => setTimeout(res, ms));

async function generateQuestion(topic, type, existingCount, existingData = []) {
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is missing from .env");
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const unitNumber = existingCount + 1;
    const blueprint = checkpointBlueprint[topic] || [];
    const checkpoint = blueprint.find(c => unitNumber >= c.range[0] && unitNumber <= c.range[1]) || { subtopic: topic, difficulty: 'Intermediate' };

    // Anti-Duplication: Full history tracking (extract titles or questions)
    const historyList = type === 'quiz'
        ? existingData.map(q => q.question || q.data?.question).filter(Boolean)
        : existingData.map(q => q.title || q.data?.title).filter(Boolean);

    let prompt = `
        System: You are Interimate AI. A high-precision curriculum generator. 
        Target Milestone: Question #${unitNumber} in ${topic}.
        Checkpoint Sub-topic: ${checkpoint.subtopic}.
        Linear Difficulty: ${checkpoint.difficulty}.
        
        ${type === 'quiz' ? `Task: Generate a UNIQUE ${unitNumber % 5 === 0 ? 'PRACTICAL CODE CHALLENGE (MCQ)' : 'STRICTLY THEORETICAL and TRICKY'} MCQ for Question #${unitNumber}. 
        CRITICAL FOR MCQs: ${unitNumber % 5 === 0 ? 'If the question asks for code output, you MUST include the code block in the "question" field using markdown backticks.' : 'ABSOLUTELY NO CODE SNIPPETS. Focus on core architectural concepts, internal workings, or common pitfalls.'}` : `Task: Code Snippet Challenge for Question #${unitNumber}. Focus on practical implementation of ${checkpoint.subtopic}.`}
        
        ANTI-DUPLICATION HISTORY (DO NOT REPEAT CONCEPTS OR WORDING FROM THESE): 
        ${historyList.join(' | ')}
        
        RULES:
        1. CONCEPTUAL UNIQUENESS: If a concept in history is "Reverse String", you MUST NOT ask anything about reversing strings. Explore a different part of ${checkpoint.subtopic}.
        2. NO OVERLAP: Do not allocate advanced topics to basic ranges. Stick strictly to ${checkpoint.subtopic}.
        3. SELENIUM: JAVA ONLY. NO PYTHON.
        4. TRICKY THEORY: For theoretical questions, focus on "What happens when...", "Why do we use...", or edge cases that test deep understanding.
        5. STRICT BREVITY: The "question" field MUST be UNDER 4 LINES. No exceptions.
        
        JSON Schema:
        ${type === 'quiz' ?
            `{"id":${unitNumber},"question":"str","options":["4 str"],"answer":0-3,"explanation":"brief str"}` :
            `{"id":${unitNumber},"title":"str","description":"brief str","template":"snippet str"}`}
        
        ${type === 'code' ? 'CRITICAL: The "template" field must contain ONLY EMPTY boilerplate (method signatures/class headers). NO LOGIC.' : ''}
        Return ONLY raw JSON. No markdown.
    `;

    let lastError = null;
    for (let i = 0; i < 4; i++) {
        try {
            const result = await model.generateContent(prompt);
            let responseText = (await result.response).text();

            // Enhanced JSON Extraction
            let jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Malformatted AI Response: No JSON found.");

            let parsed = JSON.parse(jsonMatch[0]);

            // Final line-count safeguard
            if (type === 'quiz' && parsed.question && parsed.question.split('\n').length > 5) {
                // If AI ignores the rule, we truncate or force a retry
                parsed.question = parsed.question.split('\n').slice(0, 4).join(' ');
            }

            return parsed;
        } catch (error) {
            lastError = error;
            console.error(`[Gemini] Attempt ${i + 1} failed:`, error.message);
            const waitTime = Math.pow(2, i) * 1000;
            await delay(waitTime);
        }
    }

    // FINAL SAFE FALLBACK: Prevent UI from hanging
    console.error("[Gemini] CRITICAL: System failed after 4 attempts. Deploying Emergency Fallback.");
    if (type === 'quiz') {
        return {
            id: unitNumber,
            question: `Explain the fundamental concept of ${checkpoint.subtopic} and its primary use case in ${topic}.`,
            options: ["It simplifies complexity", "It enhances performance", "It ensures reliability", "All of the above"],
            answer: 3,
            explanation: "Fallback question generated due to tactical engine synchronization delay."
        };
    } else {
        return {
            id: unitNumber,
            title: `${checkpoint.subtopic} Implementation`,
            description: `Write a basic implementation of ${checkpoint.subtopic} using Java.`,
            template: "// Base implementation required here"
        };
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
