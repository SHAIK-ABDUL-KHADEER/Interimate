const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Question } = require('./models');

let genAI = null;

const topicContext = {
    'java': 'Core Java logic/syntax. Cover: Loops, arrays, strings, OOP, Collections, Exception handling.',
    'selenium': 'Selenium WebDriver in JAVA ONLY. Cover: Finding elements (ID, XPath, CSS), Actions, Sync strategies, Framework basics.',
    'sql': 'Relational SQL. Cover: DDL, DML, JOINS, Subqueries, Indexes.',
    'functional': 'Functional Testing. Topics: Agile, SDLC, STLC, V-Model, QA/QE/QC, White/Black Box, Static/Dynamic, V&V, GUI, Strategies (Regression, Smoke, Sanity), Defect Lifecycle.'
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
            let budgets = [];
            if (topics.length === 1) budgets = [{ name: topics[0], total: 10, cached: 4, new: 6 }];
            else if (topics.length === 2) {
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

            // 2. Determine current topic and mode
            let currentTopic = null, cumulativeTotal = 0, relativeIdx = 0;
            for (const b of budgets) {
                if (qCount <= cumulativeTotal + b.total) {
                    currentTopic = b;
                    relativeIdx = qCount - cumulativeTotal;
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
        
        CRITICAL: DO NOT include any feedback, greeting, or acknowledgement in the "question" field. The "question" field must contain ONLY the technical question itself. Place all conversational text in the "feedback" field.
        CRITICAL: The technical question MUST be concise and limited to exactly 1-3 sentences (maximum 3 lines).
        
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
