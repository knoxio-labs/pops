import { cva, type VariantProps } from 'class-variance-authority';

export const containerVariants = cva(
  'flex flex-wrap items-center gap-2 w-full bg-background text-foreground transition-all outline-0 focus-within:outline-0 ring-0 focus-within:ring-0 p-2 min-h-11',
  {
    variants: {
      variant: {
        default: 'border border-border',
        ghost: 'border-0 hover:bg-accent',
        underline: 'border-0 border-b border-border rounded-none',
      },
      shape: {
        default: 'rounded-md',
        pill: 'rounded-full',
      },
    },
    compoundVariants: [{ variant: 'underline', shape: 'pill', class: 'rounded-none' }],
    defaultVariants: { variant: 'default', shape: 'default' },
  }
);

export const inputVariants = cva(
  'flex-1 bg-transparent border-0 outline-0 shadow-none focus:outline-0 focus:ring-0 focus:shadow-none focus-visible:outline-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed min-w-30',
  {
    variants: {
      size: { sm: 'text-xs', default: 'text-sm', lg: 'text-base' },
    },
    defaultVariants: { size: 'default' },
  }
);

export type ChipInputVariant = VariantProps<typeof containerVariants>['variant'];
export type ChipInputShape = VariantProps<typeof containerVariants>['shape'];
