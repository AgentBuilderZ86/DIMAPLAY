import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { TabKey } from './EmptyTab';

const PATHS: Record<Exclude<TabKey, 'film' | 'play' | 'profile'>, string[]> = {
  home: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ranking: [
    'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z',
    'M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  ],
};

export function TabIcon({
  tab,
  color,
  size = 22,
}: {
  tab: TabKey;
  color: ColorValue;
  size?: number;
}) {
  const common = { fill: 'none', stroke: color, strokeWidth: 2 } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {tab === 'play' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 7l4 3-1.5 5h-5L8 10z" {...common} />
        </>
      )}
      {tab === 'film' && (
        <>
          <Rect x="3" y="6" width="13" height="12" rx="2" {...common} />
          <Path d="M16 10l5-3v10l-5-3" {...common} />
        </>
      )}
      {tab === 'profile' && (
        <>
          <Rect x="5" y="3" width="14" height="18" rx="2" {...common} />
          <Circle cx="12" cy="10" r="3" {...common} />
          <Path d="M8.5 17c.8-1.8 2-2.5 3.5-2.5s2.7.7 3.5 2.5" {...common} />
        </>
      )}
      {(tab === 'home' || tab === 'ranking') &&
        PATHS[tab].map((d) => <Path key={d} d={d} {...common} />)}
    </Svg>
  );
}
