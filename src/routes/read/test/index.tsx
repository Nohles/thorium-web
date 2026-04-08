import { createFileRoute } from '@tanstack/react-router'
import { usePublication } from '@/hooks/usePublication';
import { StatefulLoader } from '@/components/Misc';
import { StatefulReaderWrapper } from '@/components/Reader/StatefulReaderWrapper';

export const Route = createFileRoute('/read/test/')({
  component: RouteComponent,
})

function RouteComponent() {
  let url = 'http://localhost:8006/webpub/ZmlsZTovLy9DaGFwdGVyIDEuY2J6/manifest.json'

  const { isLoading, error, publication, profile, localDataKey } = usePublication({
    url: url,
    onError: (error) => {
      console.error("Publication loading error:", error);
    },
  });
  return (
    <StatefulLoader isLoading={isLoading}>
      {publication && (
        <StatefulReaderWrapper profile={profile} publication={publication} localDataKey={localDataKey} />
      )}
    </StatefulLoader>
  )
}
