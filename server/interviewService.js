const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs').promises;
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'data', 'questions_cache.json');

const topicContext = {
    'java': 'Core Java logic/syntax. Cover: Loops, arrays, strings, OOP, Collections, Exception handling.',
    'selenium': 'Selenium WebDriver in JAVA ONLY. Cover: Finding elements (ID, XPath, CSS), Actions, Sync strategies, Framework basics.',
    'sql': 'Relational SQL. Cover: DDL, DML, JOINS, Subqueries, Indexes.'
};

let genAI = null;

async function getNextInterviewQuestion(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const qCount = interview.history.length + 1;
    let context = "";

    // Topic Caching Logic
    if (interview.type === 'topic') {
        try {
            const cacheRaw = await fs.readFile(CACHE_PATH, 'utf8');
            const cache = JSON.parse(cacheRaw);
            const topics = interview.topics;

            // 1. Calculate budgets per topic
            // Topic structure: { name, total, cached, new }
            let budgets = [];
            if (topics.length === 1) {
                budgets = [{ name: topics[0], total: 10, cached: 4, new: 6 }];
            } else if (topics.length === 2) {
                budgets = [
                    { name: topics[0], total: 5, cached: 2, new: 3 },
                    { name: topics[1], total: 5, cached: 2, new: 3 }
                ];
            } else if (topics.length === 3) {
                budgets = [
                    { name: topics[0], total: 3, cached: 1, new: 2 },
                    { name: topics[1], total: 3, cached: 1, new: 2 },
                    { name: topics[2], total: 4, cached: 1, new: 3 }
                ];
            }

            // 2. Determine current topic and mode for this qCount
            let currentTopic = null;
            let relativeIdx = 0;
            let cumulativeTotal = 0;
            for (const b of budgets) {
                if (qCount <= cumulativeTotal + b.total) {
                    currentTopic = b;
                    relativeIdx = qCount - cumulativeTotal; // 1-based index within topic
                    break;
                }
                cumulativeTotal += b.total;
            }

            // 3. Mode decision: First 'cached' slots explore cache, rest use Gemini
            const useCache = relativeIdx <= currentTopic.cached;
            const topicCache = cache[currentTopic.name] || [];

            if (useCache && topicCache.length > 0) {
                // Pick a random question from cache that hasn't been used in this session context
                // (Though index-based budgets already minimize repetition within a session)
                const randomIndex = Math.floor(Math.random() * topicCache.length);
                const cachedQ = topicCache[randomIndex];
                return {
                    ...cachedQ,
                    feedback: qCount === 1 ? `I see you're ready for ${currentTopic.name}. Let's begin.` : `Acknowledge your answer. Moving on with ${currentTopic.name}...`
                };
            }

            // If mode is 'new' OR cache is empty, escalate to Gemini
            const result = await generateTopicQuestionWithGemini(interview, currentTopic.name, qCount, model);

            // Save new question to cache for future guys
            if (result && result.question) {
                topicCache.push({ question: result.question, isCodeRequired: result.isCodeRequired });
                // Limit cache size to 50 per topic for health
                if (topicCache.length > 50) topicCache.shift();
                cache[currentTopic.name] = topicCache;
                await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
            }
            return result;

        } catch (err) {
            console.error("[InterviewService] Cache/Budget Error:", err.message);
            // Fallback to legacy behavior if anything fails
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
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "Briefly acknowledge previous answer if session is active."}
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
