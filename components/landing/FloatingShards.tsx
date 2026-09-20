'use client';

import type { CSSProperties } from 'react';

import './FloatingShards.css';

type FloatingShardsProps = {
  className?: string;
};

type ShardStyle = CSSProperties & Record<`--${string}`, string>;

const SHARDS = [
  ['8%', '16%', 18, 6, -12, -16, 7.2, 1.1, 0.44],
  ['17%', '68%', 13, -8, 18, -10, 8.4, 2.5, 0.30],
  ['25%', '31%', 22, 12, -9, 14, 9.6, 0.6, 0.37],
  ['34%', '78%', 15, -15, 16, -12, 7.8, 3.8, 0.28],
  ['43%', '20%', 12, 10, -18, 10, 10.3, 4.4, 0.34],
  ['52%', '57%', 20, -11, 13, -15, 8.9, 2.0, 0.39],
  ['61%', '12%', 14, 14, -14, 12, 7.6, 0.2, 0.31],
  ['69%', '73%', 24, -13, 19, -8, 10.8, 3.1, 0.42],
  ['77%', '34%', 16, 9, -11, 15, 8.1, 1.8, 0.33],
  ['86%', '61%', 12, -10, 15, -13, 9.2, 4.9, 0.27],
  ['11%', '46%', 15, 11, -16, 13, 9.7, 5.4, 0.29],
  ['30%', '58%', 19, -9, 12, -11, 7.9, 6.2, 0.35],
  ['47%', '72%', 13, 13, -15, 9, 10.1, 5.0, 0.25],
  ['58%', '38%', 17, -14, 10, -14, 8.6, 6.8, 0.36],
  ['73%', '17%', 11, 8, -13, 12, 9.8, 7.3, 0.24],
  ['92%', '28%', 18, -12, 17, -9, 11.2, 2.9, 0.32],
  ['5%', '84%', 14, 13, -18, 11, 8.7, 4.1, 0.26],
  ['81%', '84%', 21, -16, 14, -12, 10.0, 1.4, 0.38],
];

function shardStyle(
  [left, top, size, dx, dy, rotation, duration, delay, opacity]: (string | number)[],
): ShardStyle {
  return {
    '--shard-left': String(left),
    '--shard-top': String(top),
    '--shard-size': `${size}px`,
    '--shard-drift-x': `${dx}px`,
    '--shard-drift-y': `${dy}px`,
    '--shard-rotation': `${rotation}deg`,
    '--shard-duration': `${duration}s`,
    '--shard-delay': `-${delay}s`,
    '--shard-opacity': String(opacity),
  };
}

export default function FloatingShards({ className = '' }: FloatingShardsProps) {
  return (
    <div className={`floating-shards ${className}`.trim()} aria-hidden="true">
      {SHARDS.map((shard, index) => (
        <span
          key={index}
          className="floating-shard"
          style={shardStyle(shard)}
        />
      ))}
    </div>
  );
}
