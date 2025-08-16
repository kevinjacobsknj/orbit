/**
 * Simple Accessibility Permissions Test
 * Tests macOS permissions without requiring Electron
 */

const { spawn } = require('child_process');

async function testAccessibilityPermissions() {
    console.log('🔐 Testing macOS Accessibility Permissions...\n');
    
    try {
        // Test 1: Basic osascript access
        console.log('1️⃣ Testing basic osascript access...');
        const testResult = await runOsaScript('tell application "System Events" to get name of first process');
        console.log(`✅ Basic access working: ${testResult.trim()}\n`);
        
        // Test 2: Test click capability (safer test)
        console.log('2️⃣ Testing click capability...');
        await runOsaScript('tell application "System Events" to click at {10, 10}');
        console.log('✅ Click capability working\n');
        
        // Test 3: Test mouse control (safe position)
        console.log('3️⃣ Testing mouse control...');
        await runOsaScript('tell application "System Events" to set mouseLoc to {10, 10}');
        console.log('✅ Mouse control working\n');
        
        console.log('🎉 ALL PERMISSION TESTS PASSED!');
        console.log('✅ macOS Accessibility permissions are properly configured');
        console.log('\n💡 The computer control system should work within the Orbit app');
        return true;
        
    } catch (error) {
        console.error('❌ Permission test failed:', error.message);
        
        if (error.message.includes('osascript is not allowed assistive access')) {
            console.error('\n🔧 ACCESSIBILITY PERMISSIONS NEEDED:');
            console.error('1. Open System Preferences > Security & Privacy > Accessibility');
            console.error('2. Click the 🔒 lock to make changes (enter password)');
            console.error('3. Click + and add "Terminal" or your IDE');
            console.error('4. Restart Terminal/IDE after adding permissions');
            console.error('\n📖 See ACCESSIBILITY_SETUP.md for detailed instructions');
        }
        
        return false;
    }
}

function runOsaScript(script) {
    return new Promise((resolve, reject) => {
        const process = spawn('osascript', ['-e', script]);
        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(`AppleScript failed: ${error}`));
            }
        });
    });
}

// Run tests if this file is executed directly
if (require.main === module) {
    testAccessibilityPermissions()
        .then(success => {
            console.log(success ? '\n✅ Ready for computer control!' : '\n❌ Please fix permissions first');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test script error:', error);
            process.exit(1);
        });
}

module.exports = testAccessibilityPermissions;