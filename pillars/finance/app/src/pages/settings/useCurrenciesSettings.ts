import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import { currenciesDelete, currenciesList, currenciesUpdate } from '../../finance-api/index.js';
import { type Currency, CurrencyFormSchema, type CurrencyFormValues } from './types';

const CURRENCIES_KEY = ['finance', 'currencies', 'list'];

const DEFAULT_FORM_VALUES: CurrencyFormValues = {
  name: '',
  symbol: '',
  decimals: '0',
  kind: 'fiat',
};

function useCurrencyMutations(args: {
  setEditing: (c: Currency | null) => void;
  setDeletingCode: (code: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: CURRENCIES_KEY });

  const updateMutation = useMutation({
    mutationFn: async (input: {
      code: string;
      data: CurrencyFormValues;
      currentDecimals: number;
    }) =>
      unwrap(
        await currenciesUpdate({
          path: { code: input.code },
          body: {
            name: input.data.name,
            symbol: input.data.symbol === '' ? null : input.data.symbol,
            // The server refuses any request carrying `decimals` for a
            // currency already in use, even when the value is unchanged —
            // only send it when the user actually edited it, so renaming an
            // in-use currency (an explicitly supported path) still works.
            decimals:
              Number(input.data.decimals) !== input.currentDecimals
                ? Number(input.data.decimals)
                : undefined,
            kind: input.data.kind,
          },
        })
      ),
    onSuccess: () => {
      toast.success('Currency updated');
      args.setEditing(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (code: string) => unwrap(await currenciesDelete({ path: { code } })),
    onSuccess: () => {
      toast.success('Currency deleted');
      args.setDeletingCode(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  return { updateMutation, deleteMutation };
}

/**
 * List + edit + delete state for the currencies section of the settings
 * page. Creation stays out of scope (POPS-2810) — currencies are minted
 * inline from the account form.
 */
export function useCurrenciesSettings() {
  const [editing, setEditing] = useState<Currency | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const query = useQuery({
    queryKey: CURRENCIES_KEY,
    queryFn: async () => unwrap(await currenciesList()),
  });

  const { updateMutation, deleteMutation } = useCurrencyMutations({
    setEditing,
    setDeletingCode,
  });

  const form = useForm<CurrencyFormValues>({
    resolver: standardSchemaResolver(CurrencyFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const handleEdit = (currency: Currency) => {
    setEditing(currency);
    form.reset({
      name: currency.name,
      symbol: currency.symbol ?? '',
      decimals: String(currency.decimals),
      kind: currency.kind,
    });
  };

  const onSubmit = (values: CurrencyFormValues) => {
    if (!editing) return;
    updateMutation.mutate({ code: editing.code, data: values, currentDecimals: editing.decimals });
  };

  return {
    query,
    form,
    editing,
    setEditing,
    deletingCode,
    setDeletingCode,
    handleEdit,
    onSubmit,
    updateMutation,
    deleteMutation,
  };
}
