const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Question } = require('./models');

let genAI = null;

const checkpointBlueprint = {
    'java': [
        { range: [1, 10], subtopic: 'Bedrock Syntax & Logic', difficulty: 'Absolute Beginner' },
        { range: [11, 25], subtopic: 'OOP Basics & Methods', difficulty: 'Beginner' },
        { range: [26, 40], subtopic: 'Advanced OOP & Interfaces', difficulty: 'Intermediate' },
        { range: [41, 55], subtopic: 'Memory, GC & Constructors', difficulty: 'Intermediate' },
        { range: [56, 70], subtopic: 'Exception Handling Protocol', difficulty: 'Advanced' },
        { range: [71, 85], subtopic: 'Collections Framework Mastery', difficulty: 'Advanced' },
        { range: [86, 100], subtopic: 'Java 8 & Data Structures', difficulty: 'Expert' }
    ],
    'selenium': [
        { range: [1, 15], subtopic: 'Architecture & ID/XPath Basics', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'Dynamic XPath & CSS Selectors', difficulty: 'Intermediate' },
        { range: [36, 55], subtopic: 'Synchronization & Logic Waits', difficulty: 'Intermediate' },
        { range: [56, 75], subtopic: 'Actions, JSExecutor & Shadow DOM', difficulty: 'Advanced' },
        { range: [76, 100], subtopic: 'POM and Page Factory frameworks', difficulty: 'Expert' }
    ],
    'sql': [
        { range: [1, 15], subtopic: 'DDL/DML bedrock fundamentals', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'Keys, Constraints & Filters', difficulty: 'Beginner' },
        { range: [36, 60], subtopic: 'Complex Relational Joins', difficulty: 'Intermediate' },
        { range: [61, 80], subtopic: 'Subqueries & Nth Salary logic', difficulty: 'Advanced' },
        { range: [81, 100], subtopic: 'JDBC & Transaction Protocols', difficulty: 'Expert' }
    ],
    'functional': [
        { range: [1, 25], subtopic: 'SDLC/STLC Lifecycle models', difficulty: 'Beginner' },
        { range: [26, 50], subtopic: 'Testing Types & Levels', difficulty: 'Intermediate' },
        { range: [51, 75], subtopic: 'Defect Management Lifecycle', difficulty: 'Advanced' },
        { range: [76, 100], subtopic: 'UAT & Agile Methodologies', difficulty: 'Expert' }
    ],
    'testng': [
        { range: [1, 20], subtopic: 'Annotations and priority systems', difficulty: 'Beginner' },
        { range: [21, 40], subtopic: 'Assertions & Grouping XML', difficulty: 'Intermediate' },
        { range: [41, 60], subtopic: 'Parallelism & DataProviders', difficulty: 'Advanced' }
    ],
    'poi': [
        { range: [1, 25], subtopic: 'Workbook and Sheet operations', difficulty: 'Intermediate' },
        { range: [26, 50], subtopic: 'Data-Driven Framework logic', difficulty: 'Advanced' }
    ]
};

async function getNextInterviewQuestion(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const qCount = interview.history.length + 1;
    let context = "";

    // --- UNIVERSAL PROTOCOL: QUESTION #1 is ALWAYS SELF-INTRODUCTION ---
    if (qCount === 1) {
        const greetingName = interview.interviewerName || interview.username || 'Operative';
        let technicalContext = "";
        if (interview.type === 'topic') technicalContext = `your experience with ${interview.topics.join(', ')}`;
        else if (interview.type === 'role-resume') technicalContext = `your profile relative to the ${interview.targetRole} position`;
        else technicalContext = `your technical background and resume`;

        return {
            question: `Hi ${greetingName}, welcome to the interview! To begin our session, could you please introduce yourself and provide a brief overview of ${technicalContext}?`,
            isCodeRequired: false,
            feedback: "Initializing Mission Protocol: Establishing Candidate Baseline..."
        };
    }

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

            // 3. Mode decision: DB Cache check (with duplicate prevention)
            const topicCache = await Question.find({ category: currentTopic.name, type: 'interview_cache' });
            const usedQuestions = interview.history.map(h => h.question);

            // Filter out already used questions from cache
            const availableCache = topicCache.filter(q => !usedQuestions.includes(q.data.question));

            if (relativeIdx <= currentTopic.cached && availableCache.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableCache.length);
                const cachedQ = availableCache[randomIndex].data;
                return {
                    ...cachedQ,
                    feedback: `Acknowledged. Moving on with ${currentTopic.name}...`
                };
            }

            // Escalation to Gemini
            const result = await generateTopicQuestionWithGemini(interview, currentTopic.name, qCount, model);

            // Save to DB Cache for future sessions (with duplicate prevention)
            if (result && result.question) {
                const exists = await Question.findOne({
                    category: currentTopic.name,
                    type: 'interview_cache',
                    'data.question': result.question
                });

                if (!exists) {
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

    const usedQuestions = interview.history.map(h => h.question);
    const codeCount = interview.history.filter(h => h.isCodeRequired).length;
    const canAskCode = codeCount < 3;

    const prompt = `
        ${context}
        Current Session Status: Question #${qCount} out of ${interview.totalQuestions}.
        History of Questions Already Asked: ${JSON.stringify(usedQuestions)}
        Current Code Question Count: ${codeCount}/3.
        
        CRITICAL TASK: Ask the NEXT relevant technical question. 
        - PROHIBITED QUESTIONS: You MUST NOT repeat any of the following already asked questions: ${JSON.stringify(usedQuestions)}.
        - QUESTION TYPE: ${canAskCode ? 'Prefer theoretical, but you can ask for code if highly relevant (limit 3 total).' : 'MANDATORY: Ask a THEORETICAL question only. No code writing allowed now.'}
        - acknowledge previous answer briefly in "feedback" field.
        
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
    const blueprint = checkpointBlueprint[topic] || [];
    const checkpoint = blueprint.find(c => qCount >= c.range[0] && qCount <= c.range[1]) || { subtopic: topic, difficulty: 'Intermediate' };
    const usedQuestions = interview.history.map(h => h.question);
    const codeCount = interview.history.filter(h => h.isCodeRequired).length;
    const canAskCode = codeCount < 3;

    const prompt = `
        System: You are a high-precision Technical Interviewer. 
        Focus Area: ${topic}.
        Sub-topic Target: ${checkpoint.subtopic}.
        Session Context: Question #${qCount} of ${interview.totalQuestions}.
        Current Code Question Count: ${codeCount}/3.
        Already Asked Questions: ${JSON.stringify(usedQuestions)}

        Task: Generate a UNIQUE challenging technical question.
        
        CRITICAL RULES:
        1. NO REPEATS: Do NOT repeat the wording or core concept of these questions: ${JSON.stringify(usedQuestions)}.
        2. QUESTION TYPE: ${canAskCode ? 'Focus on depth. Coding challenges allowed (max 3 total).' : 'MANDATORY: Ask a THEORETICAL/ARCHITECTURAL question only.'}
        3. BREVITY: MAX 3 LINES.
        
        JSON FORMAT ONLY:
        {"question": "str (MAX 3 LINES)", "isCodeRequired": boolean, "feedback": "Brief acknowledgment (MAX 3 LINES)."}
    `;
    const result = await model.generateContent(prompt);
    let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    return JSON.parse(text);
}

async function generateFinalReport(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `
        You are a Senior Technical Recruiter and Tech Lead. Evaluate this candidate with absolute accuracy based on their 10-question interview session.
        Candidate Name: ${interview.interviewerName}
        Topics/Context: ${interview.type === 'topic' ? interview.topics.join(', ') : (interview.type === 'role-resume' ? `Role: ${interview.targetRole} + Resume` : 'Resume Based')}
        
        Full Interview Transcript:
        ${interview.history.map((h, i) => `
        Q${i + 1}: ${h.question}
        User Answer: ${h.answer || '[ NO RESPONSE PROVIDED ]'}
        `).join('\n')}

        Task: Provide a high-fidelity assessment.
        - SCORING: Be highly critical. Only a perfect, industry-ready candidate gets a 9 or 10.
        - RAG STATUS:
            - Green: Ready for immediate deployment (Score 8-10)
            - Amber: High potential, needs specific training (Score 5-7)
            - Red: Not currently suitable (Score 1-4)
        
        JSON FORMAT ONLY:
        { "strengths": ["str"], "improvements": ["str"], "score": number (1-10), "summary": "str" }
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        const report = JSON.parse(text);

        // Add RAG Status Logic
        if (report.score >= 8) report.rag = 'Green';
        else if (report.score >= 5) report.rag = 'Amber';
        else report.rag = 'Red';

        return report;
    } catch (error) {
        console.error("[InterviewService] Report Error:", error.message);
        throw error;
    }
}

module.exports = { getNextInterviewQuestion, generateFinalReport };
