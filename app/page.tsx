import { redirect } from 'next/navigation';

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // This is a server component, redirect happens on the server
  // If user comes to root with a token, redirect to claim page
  // Otherwise show a simple landing

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-white">Evolute</h1>
        <p className="text-gray-400 max-w-md">
          Tournament prize claim portal. Use the claim link provided to you to claim your USDC
          prize.
        </p>
        <div className="bg-gray-800/50 rounded-lg p-4">
          <p className="text-sm text-gray-400">
            Looking for your claim link? Check your email from Evolute tournaments.
          </p>
        </div>
      </div>
    </div>
  );
}
