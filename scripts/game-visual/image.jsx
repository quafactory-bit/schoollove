// Local fixture only: final optimized files without Next's image server.
export default function Image({priority, sizes, fetchPriority, ...props}) {
  return <img {...props} sizes={sizes} fetchPriority={fetchPriority ?? (priority ? 'high' : 'auto')} />
}
