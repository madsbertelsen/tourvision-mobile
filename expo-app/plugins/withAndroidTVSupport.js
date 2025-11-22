const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin to make Android TV compatible by declaring hardware features as optional
 */
const withAndroidTVSupport = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest;

    // Ensure uses-feature array exists
    if (!mainApplication['uses-feature']) {
      mainApplication['uses-feature'] = [];
    }

    // Features to declare as optional (not required) for TV compatibility
    const optionalFeatures = [
      'android.hardware.location',
      'android.hardware.location.gps',
      'android.hardware.location.network',
      'android.hardware.touchscreen',
    ];

    // Add each feature as optional
    optionalFeatures.forEach((featureName) => {
      // Check if feature already exists
      const existingFeature = mainApplication['uses-feature'].find(
        (feature) => feature.$['android:name'] === featureName
      );

      if (!existingFeature) {
        mainApplication['uses-feature'].push({
          $: {
            'android:name': featureName,
            'android:required': 'false',
          },
        });
      } else {
        // Update existing to be optional
        existingFeature.$['android:required'] = 'false';
      }
    });

    // Declare faketouch as required (for TV D-pad navigation)
    const fakeTouchFeature = mainApplication['uses-feature'].find(
      (feature) => feature.$['android:name'] === 'android.hardware.faketouch'
    );

    if (!fakeTouchFeature) {
      mainApplication['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.faketouch',
          'android:required': 'true',
        },
      });
    }

    // Declare leanback as REQUIRED for TV (Play Console requirement)
    const leanbackFeature = mainApplication['uses-feature'].find(
      (feature) => feature.$['android:name'] === 'android.software.leanback'
    );

    if (!leanbackFeature) {
      mainApplication['uses-feature'].push({
        $: {
          'android:name': 'android.software.leanback',
          'android:required': 'true',
        },
      });
    } else {
      // Update existing to be required
      leanbackFeature.$['android:required'] = 'true';
    }

    return config;
  });
};

module.exports = withAndroidTVSupport;
