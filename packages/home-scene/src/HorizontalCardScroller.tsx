import { Children, isValidElement, useCallback, useRef, type ReactNode, type Ref } from 'react';
import { useCardScroll } from './useCardScroll';
import './horizontal-card-scroll.css';

type Props = {
  page: number;
  count: number;
  pageSize: number;
  columns?: 1 | 2 | 3 | 4;
  onChange: (page: number) => void;
  resetKey: string;
  label: string;
  children: ReactNode;
  className?: string;
  id?: string;
  viewportRef?: Ref<HTMLDivElement>;
};

/** Scroll the cards themselves, keeping their keyed DOM nodes and the existing footer controls. */
export function HorizontalCardScroller({ page, count, pageSize, columns = 2, onChange, resetKey, label, children, className = '', id, viewportRef }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const size = Math.max(columns, pageSize);
  const rows = Math.max(1, Math.min(32, Math.ceil(size / columns)));
  const scroll = useCardScroll(track, { page, count, resetKey, onChange });

  /** Forward the same stable viewport to responsive card-capacity measurement. */
  const capture = useCallback((element: HTMLDivElement | null) => {
    track.current = element;
    if (typeof viewportRef === 'function') viewportRef(element);
    else if (viewportRef) viewportRef.current = element;
  }, [viewportRef]);

  return <div ref={capture} id={id} className={`${className} horizontal-card-scroller card-scroll-columns-${columns} card-scroll-rows-${rows}`}
    role="group" aria-label={label} data-card-scroller={label} data-card-page={page} data-card-count={count} data-page-size={size} data-dragging={scroll.dragging}
    onPointerDown={scroll.onPointerDown} onPointerMove={scroll.onPointerMove} onPointerCancel={scroll.onPointerCancel}
    onTouchStart={scroll.onTouchStart} onWheel={scroll.onWheel} onScroll={scroll.onScroll}
    onDragStart={(event) => event.preventDefault()}
    onClickCapture={(event) => { if (event.detail > 0 && scroll.shouldBlockClick()) { event.preventDefault(); event.stopPropagation(); } }}>
    {Array.from({ length: Math.max(size, count * size) }, (_, index) => {
      const item = items[index];
      const itemPage = Math.floor(index / size);
      const visible = itemPage === page && !scroll.dragging;
      const near = Math.abs(itemPage - scroll.windowPage) <= 1 || itemPage === page;
      return <div key={isValidElement(item) ? item.key : `empty-${index}`} className="card-scroll-item" data-card-page-item={itemPage} data-page-start={index % size === 0} inert={!visible} aria-hidden={!visible || undefined}>
        {near ? item : null}
      </div>;
    })}
  </div>;
}
