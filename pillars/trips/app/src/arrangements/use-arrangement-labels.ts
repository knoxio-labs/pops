import { useTranslation } from 'react-i18next';

import type { TFunction } from 'i18next';

import type { ArrangementLabels } from '@pops/trips-workspace';

/** Translate every arrangement control and exact source-state label through the host catalogue. */
export function useArrangementLabels(): ArrangementLabels {
  const { t } = useTranslation('trips');
  return {
    title: t('arrangements.title'),
    invalidIdentity: t('arrangements.invalidIdentity'),
    loading: t('arrangements.loading'),
    empty: t('arrangements.empty'),
    search: t('arrangements.search'),
    kind: t('arrangements.kind'),
    allKinds: t('arrangements.allKinds'),
    purchase: t('arrangements.purchase'),
    allPurchases: t('arrangements.allPurchases'),
    notPurchased: t('arrangements.notPurchased'),
    noVisit: t('arrangements.noVisit'),
    visit: t('arrangements.visit'),
    contactReference: t('arrangements.contactReference'),
    contactMissing: t('arrangements.contactMissing'),
    contactsUnavailable: t('arrangements.contactsUnavailable'),
    contactReadError: t('arrangements.contactReadError'),
    referenceDetails: t('arrangements.referenceDetails'),
    visitUnavailable: t('arrangements.visitUnavailable'),
    placeUnavailable: t('arrangements.placeUnavailable'),
    journey: t('arrangements.journey'),
    stay: t('arrangements.stay'),
    event: t('arrangements.event'),
    rental: t('arrangements.rental'),
    close: t('arrangements.close'),
    handledBy: t('arrangements.handledBy'),
    self: t('arrangements.self'),
    unset: t('arrangements.unset'),
    clear: t('arrangements.clear'),
    chooseContact: t('arrangements.chooseContact'),
    reconcileResponsibility: t('arrangements.reconcileResponsibility'),
    responsibilityUncertain: t('arrangements.responsibilityUncertain'),
    pickup: t('arrangements.pickup'),
    return: t('arrangements.return'),
    provider: t('arrangements.provider'),
    start: t('arrangements.start'),
    end: t('arrangements.end'),
    status: t('arrangements.status'),
    save: t('arrangements.save'),
    undo: t('arrangements.undo'),
    reload: t('arrangements.reload'),
    sourceChanged: t('arrangements.sourceChanged'),
    unknownCoverage: t('arrangements.unknownCoverage'),
    accommodationMissing: t('arrangements.accommodationMissing'),
    accommodationOverlap: t('arrangements.accommodationOverlap'),
    addStay: t('arrangements.addStay'),
    creationUncertain: t('arrangements.creationUncertain'),
    beginNewStay: t('arrangements.beginNewStay'),
    sourceStates: stateLabels(t),
  };
}

function stateLabels(t: TFunction<'trips'>): ArrangementLabels['sourceStates'] {
  return {
    Considering: t('arrangements.sourceStates.Considering'),
    Agreed: t('arrangements.sourceStates.Agreed'),
    Reserved: t('arrangements.sourceStates.Reserved'),
    Purchased: t('arrangements.sourceStates.Purchased'),
    'In plan': t('arrangements.sourceStates.In plan'),
    Alternative: t('arrangements.sourceStates.Alternative'),
    Booked: t('arrangements.sourceStates.Booked'),
    'Not arranged': t('arrangements.sourceStates.Not arranged'),
    'Not needed': t('arrangements.sourceStates.Not needed'),
  };
}
