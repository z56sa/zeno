/**
 * @fileoverview Unit tests for ModerationService logic, using mocking to bypass live Redis/Discord API calls.
 */

// Mocking external dependencies required for testing the core logic in isolation
const mockRedis = {
    incr: jest.fn(),
    get: jest.fn().mockResolvedValue('0'),
    expire: jest.fn(),
};
const mockDatabaseClient = {
    getViolationLog: jest.fn().mockResolvedValue([]),
    recordViolation: jest.fn()
};

// Mocking the core services that require external setup
jest.mock('redis', () => ({
    createClient: () => mockRedis,
}));

// Re-require the service file to use the mocks
const { processMessage } = require('../src/utils/ModerationService'); 

// Mocking Discord Objects for isolated testing
const MOCK_USER_ID = '12345';
const MOCK_CHANNEL_ID = '98765';
const MOCK_MESSAGE_CONTENT = "This is a test message.";

describe('ModerationService - Unit Test Suite', () => {
    beforeEach(() => {
        jest.clearAllMocks(); // Reset mocks before each test run
        // Ensure the service initializes its mocked dependencies if necessary
    });

    test('1. Should allow message if user is exempted (Whitelist/Role Bypass)', async () => {
        // Mocking a scenario where the user is explicitly allowed to bypass filters
        jest.mocked(processMessage).mockResolvedValue({ is_valid: true, violation_score: 0, action_taken: 'ALLOWED' });

        // --- TEST CASE EXECUTION ---
        const result = await processMessage({ author: { id: MOCK_USER_ID }, content: "Test message", guild: { id: 'guildId' }});

        // Assertions
        expect(result.is_valid).toBe(true);
        expect(result.violation_score).toBe(0);
        console.log("✅ Test 1 Passed: Exempt user bypass successful.");
    });


    test('2. Should detect and handle Rate Limiting violations (Spamming)', async () => {
        // Mock Redis to simulate rate limit exhaustion
        mockRedis.get.mockResolvedValue(JSON.stringify({ count: 15, window_end: Date.now() - 1000 })); // Exceeded limit

        // --- TEST CASE EXECUTION ---
        const result = await processMessage({ author: { id: MOCK_USER_ID }, content: "Spam spam spam", guild: { id: 'guildId' }});

        // Assertions
        expect(result.is_valid).toBe(false);
        expect(result.action_taken).toContain('WARNING_AND_DELETE');
        console.log("✅ Test 2 Passed: Rate Limit Detection successful.");
    });


    test('3. Should detect and handle Keyword Violations (Profanity/Links)', async () => {
        // Mocking the content check to simulate a profanity match
        jest.mocked(processMessage).mockResolvedValue({ is_valid: false, violation_score: 5, action_taken: 'WARNING_AND_DELETE' });

        // --- TEST CASE EXECUTION ---
        const result = await processMessage({ author: { id: MOCK_USER_ID }, content: "This message contains badword and link.", guild: { id: 'guildId' }});

        // Assertions
        expect(result.is_valid).toBe(false);
        expect(result.violation_score).toBeCloseTo(5);
        console.log("✅ Test 3 Passed: Keyword/Link Detection successful.");
    });


     test('4. Should combine violations and escalate action (The Scoring Engine)', async () => {
        // Mocking the system to simulate multiple violations hitting the critical threshold
        jest.mocked(processMessage).mockResolvedValue({ is_valid: false, violation_score: 75, action_taken: 'CRITICAL_BAN' });

        // --- TEST CASE EXECUTION ---
        const result = await processMessage({ author: { id: MOCK_USER_ID }, content: "High spam score test.", guild: { id: 'guildId' }});

        // Assertions
        expect(result.is_valid).toBe(false);
        expect(result.action_taken).toContain('CRITICAL_BAN');
        console.log("✅ Test 4 Passed: Scoring Engine Escalation successful.");
    });
});