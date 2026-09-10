// Local fixture only: final optimized files without Next's image server.
export default function Image({priority, sizes, ...props}) {
  return <img {...props} sizes={sizes} fetchPriority={priority ? 'high' : 'auto'} />
}
