import { BookOpen, ChevronDown, ExternalLink, Info, Search } from 'lucide-react';

const steps = [
  {
    title: 'Find guidance',
    description: 'Search by topic or browse by specialty and publisher.',
    Icon: Search,
  },
  {
    title: 'Check the source',
    description: 'View publisher information, available document metadata and review status.',
    Icon: BookOpen,
  },
  {
    title: 'Read the original',
    description: "Follow the link to the official publisher's document.",
    Icon: ExternalLink,
  },
];

export default function AboutHub({ headingLevel = 1 }: { headingLevel?: 1 | 2 }) {
  const Title = headingLevel === 1 ? 'h1' : 'h2';
  const Heading = headingLevel === 1 ? 'h2' : 'h3';
  const StepHeading = headingLevel === 1 ? 'h3' : 'h4';
  const headingClass = 'text-[1.375rem] font-semibold leading-snug tracking-tight text-slate-900';
  const proseClass = 'max-w-3xl';

  return (
    <article aria-labelledby="about-hub-title" className="mx-auto w-full max-w-5xl space-y-8 break-words pb-4 text-base leading-relaxed text-slate-700">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-5 py-7 text-white sm:px-8 sm:py-9">
        <Title id="about-hub-title" className="max-w-3xl font-serif text-[2rem] leading-tight tracking-tight">
          UK orthopaedic guidance, easier to find.
        </Title>
        <div className="mt-3 max-w-3xl space-y-2 text-slate-200">
          <p>A focused reference directory bringing together guidance from UK national organisations and orthopaedic specialist societies.</p>
          <p>Find relevant guidance by topic, specialty or publisher, then access the original document directly.</p>
        </div>
      </header>

      <section className="space-y-3">
        <Heading className={headingClass}>Why it exists</Heading>
        <div className={proseClass + ' space-y-2'}>
          <p>Orthopaedic guidance is published across multiple organisations and websites. Finding the right document can mean searching several sources.</p>
          <p>This Hub brings those references into one searchable place while keeping the original publisher as the authoritative source.</p>
        </div>
      </section>

      <section className="space-y-4">
        <Heading className={headingClass}>How it works</Heading>
        <ol className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          {steps.map(({ title, description, Icon }) => (
            <li key={title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:block lg:p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-800 lg:mb-3">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <StepHeading className="font-semibold text-slate-900">{title}</StepHeading>
                <p className="mt-1">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3 border-t border-slate-200 pt-6 sm:pt-8">
        <Heading className={headingClass}>Keeping the directory reliable</Heading>
        <p className={proseClass}>The directory uses publisher information to check entries. Recorded editorial review and link accessibility are shown separately. The catalogue is being expanded and reviewed as new guidance and editions are identified.</p>
        <details className="group max-w-3xl">
          <summary className="flex min-h-11 w-fit max-w-full cursor-pointer list-none items-center gap-2 rounded px-1 font-semibold text-blue-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 group-open:rotate-180" />
            Understanding guidance status
          </summary>
          <p className="pb-2 pl-7">Guidance status describes what the directory records about the source. Link status reflects recorded accessibility. A recorded editorial date alone does not establish independent clinical sign-off.</p>
        </details>
      </section>

      <section className="space-y-4">
        <Heading className={headingClass}>Development status</Heading>
        <div className={proseClass + ' space-y-2'}>
          <p>The Hub is an independent project under development. Catalogue coverage and review processes are being improved to make UK orthopaedic guidance easier to discover and maintain.</p>
          <p>It is not NHS-endorsed, does not replace clinical judgement and is not a treatment decision-support system.</p>
        </div>
        <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-100 px-4 py-4 text-slate-800 sm:px-5">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-slate-600" />
          <p className="max-w-3xl">
            <strong>A working link does not confirm that guidance is current or clinically approved.</strong>{' '}
            Always check the latest source document and applicable local policy.
          </p>
        </div>
      </section>
    </article>
  );
}
