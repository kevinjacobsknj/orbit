/**
 * Test Script for Computer Control System
 * Verifies that all components are working correctly
 */

const screenControl = require('./src/features/screen-control');

async function testComputerControl() {
    console.log('🧪 Testing Computer Control System...\n');
    
    try {
        // Test 1: Check if screen control can be initialized
        console.log('1️⃣ Testing initialization...');
        const { createStreamingLLM } = require('./src/features/common/ai/factory');
        
        const aiProvider = createStreamingLLM('anthropic', { 
            model: 'claude-sonnet-4',
            apiKey: process.env.ANTHROPIC_API_KEY,
            temperature: 0.1,
            maxTokens: 4096
        });
        
        await screenControl.initialize(aiProvider, 'claude-sonnet-4');
        console.log('✅ Initialization successful\n');
        
        // Test 2: Check screen capture
        console.log('2️⃣ Testing screen capture...');
        const screenCapture = require('./src/features/screen-control/screenCapture');
        const capture = await screenCapture.captureScreen();
        console.log(`✅ Screen captured: ${capture.size.width}x${capture.size.height}\n`);
        
        // Test 3: Check mouse control permissions
        console.log('3️⃣ Testing mouse control permissions...');
        const mouseControl = require('./src/features/screen-control/mouseControl');
        try {
            // Test a safe position (far corner)
            await mouseControl.click(10, 10);
            console.log('✅ Mouse control working\n');
        } catch (error) {
            if (error.message.includes('ACCESSIBILITY PERMISSION')) {
                console.log('❌ Accessibility permissions needed');
                console.log(error.message);
                return false;
            }
            throw error;
        }
        
        // Test 4: Test simple screen analysis
        console.log('4️⃣ Testing AI vision analysis...');
        const result = await screenControl.analyzeScreen('What applications are visible on screen?');
        console.log(`✅ Vision analysis complete: ${result.analysis.reasoning}\n`);
        
        // Test 5: Test memory system
        console.log('5️⃣ Testing memory system...');
        const MemoryStore = require('./src/features/screen-control/memoryStore');
        const memory = new MemoryStore();
        memory.store('test_key', 'test_value');
        const retrieved = memory.retrieve('test_key');
        console.log(`✅ Memory system working: ${retrieved.success}\n`);
        
        console.log('🎉 ALL TESTS PASSED! Computer control system is ready.');
        console.log('\n💡 Try: "go to google.com and search for cats"');
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('- Check ANTHROPIC_API_KEY environment variable');
        console.error('- Review ACCESSIBILITY_SETUP.md for permission setup');
        console.error('- Ensure all dependencies are installed');
        return false;
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    testComputerControl()
        .then(success => process.exit(success ? 0 : 1))
        .catch(error => {
            console.error('Test script error:', error);
            process.exit(1);
        });
}

module.exports = testComputerControl;