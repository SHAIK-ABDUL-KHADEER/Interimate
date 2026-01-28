const { GoogleGenerativeAI } = require("@google/generative-ai");
const { CompQuestion, CompTeam } = require('./models');

const competitionBlueprint = {
    'java': [
        'Java Fundamentals & Data Types',
        'Operators and Control Flow',
        'Classes and Objects basics',
        'Methods and Constructors',
        'Inheritance & Polymorphism',
        'Interfaces & Abstract Classes',
        'Static vs Instance members',
        'Encapsulation & Access Modifiers',
        'Exception Handling Basics',
        'String Handling & Memory Basics'
    ],
    'sql': [
        'Select Statements & Aliases',
        'Filtering with WHERE & LIKE',
        'ORDER BY & Group Functions',
        'Primary vs Foreign Keys',
        'Basic Joins (Inner, Left)',
        'Aggregate Functions (SUM, COUNT)',
        'DDL vs DML Commands',
        'Data Constraints',
        'Null Handling Logic',
        'Basic Subqueries'
    ]
};

let genAI = null;

async function getCompetitionQuestion(teamName, topic, currentQuestionIdx) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-1.5-flash" });

    // Determine if this should be a "Shared" question (5 per team)
    // We'll use a deterministic approach: Questions 5, 10, 15, 20, 25 are shared from other teams
    const sharedMilestones = [5, 10, 15, 20, 25];
    const isShared = sharedMilestones.includes(currentQuestionIdx);

    if (isShared) {
        // Try to find a question from ANOTHER team that this team hasn't answered yet
        const answeredQuestions = await CompQuestion.find({ teamName: teamName, topic: topic }).distinct('data.question');

        const sharedQ = await CompQuestion.findOne({
            topic: topic,
            teamName: { $ne: teamName },
            'data.question': { $nin: answeredQuestions }
        }).sort({ createdAt: -1 });

        if (sharedQ) {
            console.log(`[CompService] Shared Question #${currentQuestionIdx} for ${teamName} from ${sharedQ.teamName}`);
            return sharedQ.data;
        }
        // Fallback to generation if no shared question available yet
    }

    // Generate a New Unique Question
    const syllabus = competitionBlueprint[topic] || competitionBlueprint['java'];
    const subtopic = syllabus[currentQuestionIdx % syllabus.length];

    // Determine question type: Every 5th question is "Predict Output" code challenge
    const isCodeChallenge = (currentQuestionIdx % 5 === 0);

    const prompt = `
        System: High-Level Competition Quiz Generator for Junior Operatives.
        Topic: ${topic}
        Concept: ${subtopic}
        Target: Question #${currentQuestionIdx} for Team: ${teamName}.
        
        REQUIRED_DIFFICULTY: Simple, Basic, Theoretical. No advanced logic.

        ${isCodeChallenge ?
            `TASK: Generate a "PREDICT THE OUTPUT" question.
            CONSTRAINTS: 
            - Include a small, simple code snippet in the question field using markdown backticks.
            - The code must be easy to trace for a beginner.
            - The question should ask "What is the output of the following code?".`
            :
            `TASK: Generate a simple THEORETICAL MCQ.
            CONSTRAINTS:
            - Focus on fundamental "What is" or "Why" concepts.
            - Strictly NO code snippets.
            - Under 3 lines of text.`
        }

        JSON FORMAT ONLY:
        {"question": "str", "options": ["4 str"], "answer": 0-3, "explanation": "1 line str"}
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        const questionData = JSON.parse(text);

        // Save for potential sharing
        await CompQuestion.create({
            topic: topic,
            questionId: currentQuestionIdx,
            teamName: teamName,
            data: questionData
        });

        return questionData;
    } catch (err) {
        console.error("[CompService] Generation Error:", err.message);
        // Emergency Fallback
        return {
            question: `* [Fallback] Explain the core concept of ${subtopic} in ${topic}.`,
            options: ["Option A", "Option B", "Option C", "Option D"],
            answer: 0,
            explanation: "Fallback question deployed due to synchronization delay."
        };
    }
}

module.exports = { getCompetitionQuestion };
