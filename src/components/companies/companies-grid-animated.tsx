"use client";

import { Reveal } from "@/components/ui/reveal";
import { CompanyCard } from "@/components/companies/company-card";

interface Company {
  slug: string;
  name: string;
  tagline: string | null;
}

interface CompaniesGridAnimatedProps {
  companies: Company[];
  companyDomain: string;
}

export function CompaniesGridAnimated({
  companies,
  companyDomain,
}: CompaniesGridAnimatedProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-4">
      {companies.map((company, i) => (
        <Reveal key={company.slug} delay={Math.min(i * 60, 600)}>
          <CompanyCard
            slug={company.slug}
            name={company.name}
            tagline={company.tagline}
            companyDomain={companyDomain}
          />
        </Reveal>
      ))}
    </div>
  );
}
