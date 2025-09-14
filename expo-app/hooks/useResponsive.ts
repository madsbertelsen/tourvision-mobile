import { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface ResponsiveConfig {
  mobile: number;
  tablet: number;
}

const DEFAULT_BREAKPOINTS: ResponsiveConfig = {
  mobile: 768,
  tablet: 1024,
};

interface ResponsiveReturn {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isSmallScreen: boolean; // mobile or tablet
}

export function useResponsive(customBreakpoints?: Partial<ResponsiveConfig>): ResponsiveReturn {
  const breakpoints = { ...DEFAULT_BREAKPOINTS, ...customBreakpoints };
  
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({ width: window.width, height: window.height });
    });

    return () => subscription?.remove();
  }, []);

  const getBreakpoint = (width: number): Breakpoint => {
    if (width < breakpoints.mobile) {
      return 'mobile';
    } else if (width < breakpoints.tablet) {
      return 'tablet';
    }
    return 'desktop';
  };

  const breakpoint = getBreakpoint(dimensions.width);
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';
  const isSmallScreen = isMobile || isTablet;

  return {
    width: dimensions.width,
    height: dimensions.height,
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
  };
}

// Helper function to get responsive styles
export function getResponsiveStyles<T extends Record<string, any>>(
  breakpoint: Breakpoint,
  styles: {
    mobile?: T;
    tablet?: T;
    desktop?: T;
    default: T;
  }
): T {
  switch (breakpoint) {
    case 'mobile':
      return styles.mobile || styles.default;
    case 'tablet':
      return styles.tablet || styles.default;
    case 'desktop':
      return styles.desktop || styles.default;
    default:
      return styles.default;
  }
}