import React, { useRef, useMemo, useState, useEffect } from 'react';
import { EventNodeData, EventType } from '../types';
import { getEventStyle } from '../utils/eventStyles';

interface DetailedHistoryGraphProps {
  allEvents: EventNodeData[];
  onNodeClick: (node: EventNodeData) => void;
}

// --- Layout Constants ---
const COLUMN_WIDTH = 220;
const LANE_HEIGHT = 65; // Increased height for specialty tag
const NODE_RADIUS = 6;
const PADDING_TOP = 20;
const GIT_COLORS = ['#63b1f0', '#63da9a', '#f0c563', '#f285b9', '#9a85f2', '#e67e22', '#1abc9c', '#3498db', '#e74c3c'];

// --- Custom Path Generator ---
const getOrthogonalPath = (d: { source: any, target: any }, columnWidth: number) => {
    const { source, target } = d;
    const R = 10; // Fillet radius
    const halfCol = columnWidth / 2;

    const sy = source.y;
    const ty = target.y;

    if (sy === ty) {
        return `M${source.x},${sy}L${target.x},${ty}`;
    }

    const s = Math.sign(ty - sy);
    const sweep = s > 0 ? 1 : 0;
    const sweepInv = s > 0 ? 0 : 1;

    return `M${source.x},${sy}` +
           `L${source.x + halfCol - R},${sy}` +
           `A${R},${R} 0 0 ${sweep} ${source.x + halfCol},${sy + R * s}` +
           `L${source.x + halfCol},${ty - R * s}` +
           `A${R},${R} 0 0 ${sweepInv} ${source.x + halfCol + R},${ty}` +
           `L${target.x},${ty}`;
};


const DetailedHistoryGraph: React.FC<DetailedHistoryGraphProps> = ({ allEvents, onNodeClick }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      const handleWheel = (e: WheelEvent) => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      };
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, []);

  const layout = useMemo(() => {
    if (!allEvents || allEvents.length === 0) return null;

    const sortedEvents = [...allEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const nodeMap = new Map(sortedEvents.map(e => [e.id, e]));
    
    const childrenMap = new Map<string, string[]>();
    sortedEvents.forEach(e => {
        e.parentIds.forEach(pId => {
            if (!childrenMap.has(pId)) childrenMap.set(pId, []);
            childrenMap.get(pId)!.push(e.id);
        });
    });

    const layoutMap = new Map<string, { x: number, y: number, lane: number, color: string, event: EventNodeData }>();
    const activeLanes = new Map<number, string>(); // lane_index -> event_id
    let colorIndex = 0;

    sortedEvents.forEach((event, i) => {
        const x = i * COLUMN_WIDTH + COLUMN_WIDTH / 2;
        let lane = -1;
        let color = '';

        const parentLayouts = event.parentIds
            .map(pid => layoutMap.get(pid))
            .filter(Boolean) as { x: number; y: number, lane: number; color: string; event: EventNodeData }[];
        
        parentLayouts.sort((a, b) => a.lane - b.lane);

        if (parentLayouts.length > 0) {
            const mainParent = parentLayouts[0];
            lane = mainParent.lane;
            color = mainParent.color;

            parentLayouts.slice(1).forEach(p => activeLanes.delete(p.lane));

            const parentChildren = (childrenMap.get(mainParent.event.id) || [])
                .map(id => nodeMap.get(id)!)
                .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            
            const isBranch = parentChildren.length > 1 && parentChildren[0].id !== event.id;

            if (isBranch) {
                let newLane = 0;
                while (activeLanes.has(newLane)) {
                    newLane++;
                }
                lane = newLane;
                color = GIT_COLORS[colorIndex++ % GIT_COLORS.length];
            }
        } else {
            let newLane = 0;
            while (activeLanes.has(newLane)) {
                newLane++;
            }
            lane = newLane;
            color = GIT_COLORS[colorIndex++ % GIT_COLORS.length];
        }
        
        activeLanes.set(lane, event.id);
        const y = PADDING_TOP + lane * LANE_HEIGHT + NODE_RADIUS;
        layoutMap.set(event.id, { x, y, lane, color, event });
    });

    const nodes = Array.from(layoutMap.values()).map(d => ({ ...d.event, ...d }));
    const nodeLayoutMap = new Map(nodes.map(n => [n.id, n]));

    const links = nodes.flatMap(child =>
        child.parentIds.map(parentId => {
            const parent = nodeLayoutMap.get(parentId);
            if (!parent) return null;
            return { source: parent, target: child, color: child.color };
        })
    ).filter(Boolean) as { source: any; target: any; color: string }[];
    
    const maxLanes = Math.max(...nodes.map(n => n.lane), 0) + 1;
    const width = sortedEvents.length * COLUMN_WIDTH;
    const height = PADDING_TOP * 2 + maxLanes * LANE_HEIGHT;

    return { nodes, links, dimensions: { width, height } };
  }, [allEvents]);
  
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tooltipRef.current && hoveredNodeId) {
        const containerRect = containerRef.current?.getBoundingClientRect();
        if(containerRect){
            tooltipRef.current.style.left = `${e.clientX - containerRect.left + 15}px`;
            tooltipRef.current.style.top = `${e.clientY - containerRect.top + 15}px`;
        }
    }
  };

  if (!layout) {
    return (
      <div className="flex h-full w-full items-center justify-center text-gray-500">
        <p>No events match the selected filters for this episode.</p>
      </div>
    );
  }

  const { nodes, links, dimensions } = layout;
  const hoveredNode = hoveredNodeId ? nodes.find(n => n.id === hoveredNodeId) : null;

  return (
    <div 
        ref={containerRef} 
        className="h-full w-full overflow-auto relative bg-gray-900/50"
        onMouseMove={handleMouseMove}
    >
      <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
        <svg className="absolute top-0 left-0" width={dimensions.width} height={dimensions.height} >
          <g>
            {links.map((link, i) => (
              <path
                key={i}
                d={getOrthogonalPath(link, COLUMN_WIDTH)}
                fill="none"
                stroke={link.color}
                strokeWidth={2}
                opacity={0.8}
              />
            ))}
            {nodes.map(node => (
                 <circle
                    key={node.id}
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill={node.color}
                 />
            ))}
          </g>
        </svg>

        {nodes.map(node => (
          <div
            key={node.id}
            className="group absolute cursor-pointer flex flex-col items-center"
            style={{
              width: COLUMN_WIDTH - 20,
              top: node.y + NODE_RADIUS + 8,
              left: node.x,
              transform: 'translateX(-50%)',
            }}
            onClick={() => onNodeClick(node)}
            onMouseOver={() => setHoveredNodeId(node.id)}
            onMouseOut={() => setHoveredNodeId(null)}
          >
            <p className="text-sm font-semibold text-center text-gray-200 group-hover:text-white line-clamp-2">
                {node.summary}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-1 mt-1">
                 <span className={`flex-shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${getEventStyle(node.type).bgColor} ${getEventStyle(node.type).color}`}>
                    {node.type}
                 </span>
                 <span className="flex-shrink-0 rounded px-2 py-0.5 text-xs font-semibold bg-gray-600/50 text-gray-300">
                    {node.specialty}
                 </span>
            </div>
             <div className="mt-1 text-xs text-gray-500 group-hover:text-gray-400">
                {node.timestamp.toLocaleDateString()}
             </div>
          </div>
        ))}
      </div>
       <div 
        ref={tooltipRef} 
        className="absolute p-3 rounded-md bg-gray-900 text-sm shadow-lg pointer-events-none ring-1 ring-white/10 transition-opacity duration-200 w-80"
        style={{ zIndex: 10, opacity: hoveredNode ? 1: 0 }}
      >
        {hoveredNode && (
            <>
                <div className="font-bold text-white">{hoveredNode.summary}</div>
                <div className="text-xs text-gray-400 mt-2 space-y-1">
                    <div><span className="font-semibold text-gray-300">Author:</span> {hoveredNode.author}</div>
                    <div><span className="font-semibold text-gray-300">Timestamp:</span> {hoveredNode.timestamp.toLocaleString()}</div>
                    <div><span className="font-semibold text-gray-300">Commit ID:</span> <span className="font-mono">{hoveredNode.id}</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/20 text-gray-300">{hoveredNode.details}</div>
            </>
        )}
      </div>
    </div>
  );
};

export default DetailedHistoryGraph;
