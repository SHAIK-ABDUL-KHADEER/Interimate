const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Question } = require('./models');

let genAI = null;

const topicContext = {
    'java': 'Core Java logic/syntax. Cover: Loops, arrays, strings, OOP (Encapsulation, Inheritance, Abstraction, Interface), Polymorphism, Overloading/Overriding, Constructors, Garbage Collection, Exceptions (throw/throws), final, Java 8, Generics, Collections (HashMap, ArrayList, LinkedList), Algorithms (Reverse, missing/duplicates).',
    'selenium': 'Selenium WebDriver in JAVA ONLY. Cover: Selenium 3 vs 4, WebDriver Interface, Locators (dynamic XPath/CSS), findElement vs findElements, Waits (Implicit/Explicit/Fluent), popups/alerts, Actions class, Shadow DOM, Dropdowns, Screenshots, Apache POI/Data-driven, POM, Page Factory.',
    'sql': 'Relational SQL. Cover: DDL, DML, JOINS, Subqueries (Nth salary), Primary vs Unique Keys, Aggregate functions. JDBC: Connection interface, PreparedStatements, connection management.',
    'functional': 'Functional Testing. Topics: SDLC/STLC (Waterfall/Agile), Bug lifecycle (flow/owner), Regression vs Retesting, Smoke vs Sanity, Functional vs Non-functional (Stress/Load/Accessibility), Levels of Testing (System/UAT), Defect management tools, Test Plan/Scenario/Case design.',
    'poi': 'Apache POI for Excel Read/Write. OPERATIONS: Workbook/Sheet/Row/Cell handling, XLSX/XLS difference. POM: Dependency configuration. Data-driven testing integration with Selenium.',
    'testng': 'TestNG Framework. SYLLABUS: Annotations (@Test, @Before/After), Assertions (Hard vs Soft), Data Driven (@DataProvider, XML), parallel execution, Test priority/dependencies, dependsOnMethods, testng.xml (Groups, Parameters), POM integration.'
};

async function getNextInterviewQuestion(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const qCount = interview.history.length + 1;
    let context = "";

    // Topic Caching Logic (DB Backed)
    if (interview.type === 'topic') {
        try {
            const topics = interview.topics;

            // 1. Calculate budgets per topic
            const n = topics.length;
            let totalTechQuestions = 15; // Floor for 1-3 topics
            if (n === 4) totalTechQuestions = 20;
            else if (n === 5) totalTechQuestions = 25;
            else if (n >= 6) totalTechQuestions = 30;

            const n_for_distribution = n;
            let budgets = [];

            const basePerTopic = Math.floor(totalTechQuestions / n_for_distribution);
            let remaining = totalTechQuestions % n_for_distribution;

            for (let i = 0; i < n_for_distribution; i++) {
                let t = basePerTopic + (remaining > 0 ? 1 : 0);
                remaining--;
                // Rule: 2 cached per 5 questions (40% ratio)
                let c = Math.floor(t * 0.4);
                if (c === 0 && t >= 3) c = 1; // Minimum 1 cached if topic has at least 3 questions
                budgets.push({ name: topics[i], total: t, cached: c, new: t - c });
            }

            // --- V2 PROTOCOL: QUESTION #1 is ALWAYS SELF-INTRODUCTION ---
            if (qCount === 1) {
                return {
                    question: `Hello ${interview.username}, I am ${interview.interviewerName}. To begin our technical evaluation session, could you please provide a brief self-introduction including your experience with ${topics.join(', ')}?`,
                    isCodeRequired: false,
                    feedback: "Initializing Technical Evaluation Protocol..."
                };
            }

            // Adjust qCount for technical question index (tech questions start at qCount 2)
            const techQCount = qCount - 1;
            if (techQCount > totalTechQuestions) return null; // Should be handled by server, but safety first.

            // 2. Determine current topic and mode
            let currentTopic = null, cumulativeTotal = 0, relativeIdx = 0;
            for (const b of budgets) {
                if (techQCount <= cumulativeTotal + b.total) {
                    currentTopic = b;
                    relativeIdx = techQCount - cumulativeTotal;
                    break;
                }
                cumulativeTotal += b.total;
            }

            // 3. Mode decision: DB Cache check
            const topicCache = await Question.find({ category: currentTopic.name, type: 'interview_cache' });

            if (relativeIdx <= currentTopic.cached && topicCache.length > 0) {
                const randomIndex = Math.floor(Math.random() * topicCache.length);
                const cachedQ = topicCache[randomIndex].data;
                return {
                    ...cachedQ,
                    feedback: qCount === 1 ? `Ready for ${currentTopic.name}. Let's begin.` : `Acknowledged. Moving on with ${currentTopic.name}...`
                };
            }

            // Escalation to Gemini
            const result = await generateTopicQuestionWithGemini(interview, currentTopic.name, qCount, model);

            // Save to DB Cache for future sessions
            if (result && result.question) {
                await Question.create({
                    category: currentTopic.name,
                    type: 'interview_cache',
                    id: Date.now(), // Use timestamp for unique id in cache
                    data: { question: result.question, isCodeRequired: result.isCodeRequired }
                });

                // Trim cache if > 50
                const count = await Question.countDocuments({ category: currentTopic.name, type: 'interview_cache' });
                if (count > 50) {
                    const oldest = await Question.findOne({ category: currentTopic.name, type: 'interview_cache' }).sort({ createdAt: 1 });
                    if (oldest) await Question.findByIdAndDelete(oldest._id);
                }
            }
            return result;
        } catch (err) {
            console.error("[InterviewService] DB Cache Error:", err.message);
        }
    }

    // Fallback for Resume-based or Cache failures
    if (interview.type === 'role-resume') {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} for the specific role of: "${interview.targetRole}".
        Evaluation Context: You must weigh their Resume history against the requirements of the "${interview.targetRole}" position.
        Resume Content: ${interview.resumeText}`;
    } else if (interview.type === 'resume') {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} based on their resume. 
        Resume Content: ${interview.resumeText}`;
    } else {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} on topics: ${interview.topics.join(', ')}.`;
    }

    const prompt = `
        ${context}
        Current Session Status: Question #${qCount} out of 10.
        History of Q&A: ${JSON.stringify(interview.history)}

        Task: Ask the NEXT relevant technical question. 
        - If previous answers were given, briefly acknowledge them in the "feedback" field but keep it strictly technical.
        
        CRITICAL: DO NOT include the interviewer's feedback or acknowledgement in the "question" field. The "question" field must contain ONLY the technical question itself.
        CRITICAL: The technical question MUST be concise and limited to exactly 1-3 sentences (maximum 3 lines).
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "feedback on previous answer"}
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[InterviewService] Legacy Error:", error.message);
        throw error;
    }
}

async function generateTopicQuestionWithGemini(interview, topic, qCount, model) {
    const prompt = `
        You are a Technical Interviewer. Focus strictly on: ${topic}.
        Syllabus Context: ${topicContext[topic]}
        Session Status: Question #${qCount} of 10.
        History: ${JSON.stringify(interview.history)}

        Task: Generate a UNIQUE challenging technical question for ${topic}.
        
        CRITICAL RULES:
        1. BREVITY: The question MUST be concise and limited to exactly 1-3 sentences (MAX 3 LINES).
        2. CODING: If this is the second or third question in this topic block, CONSIDER asking for a code snippet or SQL query. 
        3. MANDATORY CODE: At least one question in the FULL interview MUST be "isCodeRequired": true. Current session index: ${qCount} of ${interview.totalQuestions + 1}.
        
        CRITICAL: DO NOT include any feedback, greeting, or acknowledgement in the "question" field. Place all conversational text in the "feedback" field (MAX 3 LINES).
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "Briefly acknowledge previous answer (MAX 3 LINES)."}
    `;
    const result = await model.generateContent(prompt);
    let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    return JSON.parse(text);
}

async function generateFinalReport(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `
        You are a Senior Technical Recruiter. Evaluate this candidate based on their 10-question interview session.
        Candidate Name: ${interview.interviewerName}
        Topics/Context: ${interview.type === 'topic' ? interview.topics.join(', ') : (interview.type === 'role-resume' ? `Role: ${interview.targetRole} + Resume` : 'Resume Based')}
        Full Interview History: ${JSON.stringify(interview.history)}

        Task: Provide a detailed assessment.
        JSON FORMAT: { "strengths": ["str"], "improvements": ["str"], "score": 1-10, "summary": "str" }
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[InterviewService] Report Error:", error.message);
        throw error;
    }
}

module.exports = { getNextInterviewQuestion, generateFinalReport };
