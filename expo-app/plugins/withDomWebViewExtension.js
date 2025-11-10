const { withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Config plugin to add DomWebViewExtension.swift to the iOS project
 * and modify AppDelegate.swift to initialize the method swizzling.
 * This ensures the custom WKWebView context menu persists across expo prebuild.
 */
const withDomWebViewExtension = (config) => {
  return withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const { projectName, platformProjectRoot } = config.modRequest;

    // ===== Step 1: Copy DomWebViewExtension.swift =====
    const sourceFilePath = path.join(__dirname, 'DomWebViewExtension.swift');
    const targetFileName = 'DomWebViewExtension.swift';
    const targetFilePath = path.join(platformProjectRoot, projectName, targetFileName);
    const targetPath = path.join(projectName, targetFileName);

    // Check if source file exists
    if (!fs.existsSync(sourceFilePath)) {
      console.error(`[withDomWebViewExtension] Source file not found: ${sourceFilePath}`);
      return config;
    }

    // Copy the Swift file to the iOS project directory
    try {
      const targetDir = path.dirname(targetFilePath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(sourceFilePath, targetFilePath);
      console.log(`[withDomWebViewExtension] Copied Swift file to: ${targetFilePath}`);
    } catch (error) {
      console.error('[withDomWebViewExtension] Error copying Swift file:', error);
      return config;
    }

    // ===== Step 2: Add DomWebViewExtension.swift to Xcode project =====
    const group = xcodeProject.pbxGroupByName(projectName);
    if (!group) {
      console.error(`[withDomWebViewExtension] Could not find group: ${projectName}`);
      return config;
    }

    const groupKey = xcodeProject.findPBXGroupKey({
      name: group.name,
      path: group.path,
    });

    // Check if file is already in project
    const existingFile = xcodeProject.hasFile(targetFileName);
    if (!existingFile) {
      // Add the Swift file to the project
      const file = xcodeProject.addSourceFile(
        targetPath,
        { target: xcodeProject.getFirstTarget().uuid },
        groupKey
      );

      if (file) {
        console.log('[withDomWebViewExtension] ✅ Successfully added DomWebViewExtension.swift to Xcode project');
      } else {
        console.warn('[withDomWebViewExtension] ⚠️ Failed to add DomWebViewExtension.swift to project');
      }
    } else {
      console.log('[withDomWebViewExtension] DomWebViewExtension.swift already exists in project');
    }

    // ===== Step 3: Modify AppDelegate.swift to add WebKit import and setup calls =====
    const appDelegateFilePath = path.join(platformProjectRoot, projectName, 'AppDelegate.swift');

    if (!fs.existsSync(appDelegateFilePath)) {
      console.error('[withDomWebViewExtension] AppDelegate.swift not found at:', appDelegateFilePath);
      return config;
    }

    let appDelegateContent = fs.readFileSync(appDelegateFilePath, 'utf8');

    // Add WebKit import if not already present
    if (!appDelegateContent.includes('import WebKit')) {
      appDelegateContent = appDelegateContent.replace(
        /(import ReactAppDependencyProvider)/,
        '$1\nimport WebKit'
      );
      console.log('[withDomWebViewExtension] Added WebKit import to AppDelegate.swift');
    }

    // Add setup calls in didFinishLaunchingWithOptions if not already present
    if (!appDelegateContent.includes('WKWebView.setupKeyboardAccessoryHiding()')) {
      appDelegateContent = appDelegateContent.replace(
        /(didFinishLaunchingWithOptions[^{]*{\s*)/,
        `$1// Setup custom WKWebView menu items and keyboard accessory hiding
    WKWebView.setupKeyboardAccessoryHiding()
    WKWebView.setupCustomMenu()

    `
      );
      console.log('[withDomWebViewExtension] Added WKWebView setup calls to AppDelegate.swift');
    }

    // Write the modified AppDelegate.swift back
    fs.writeFileSync(appDelegateFilePath, appDelegateContent, 'utf8');
    console.log('[withDomWebViewExtension] ✅ Successfully modified AppDelegate.swift');

    return config;
  });
};

module.exports = withDomWebViewExtension;
