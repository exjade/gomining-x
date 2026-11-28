/**
 * SCRUM-275 / SCRUM-289 / SCRUM-280 (W05)
 * Client USDT Withdrawal Form (`WithdrawalForm.tsx`) + Headless State Controller
 *
 * Strictly isolated for Client branch (`main` @ 62e5cb3).
 * Connects exclusively to the verified W01..W04 contracts and services:
 * - W01 (`src/types/withdrawal.ts`): Domain DTOs, Micro-USDT math, address validators, fault codes.
 * - W02 (`src/services/withdrawals/withdrawalAuthGuard.ts`): Client session & Bearer auth guard.
 * - W03 (`src/services/withdrawals/withdrawalConfigQuoteClient.ts`): `GET /api/withdrawals/config` & `POST /api/withdrawals/quote` (`EXACT_AMOUNT` & `MAX_AVAILABLE`).
 * - W04 (`src/services/withdrawals/withdrawalRequestClient.ts`): `POST /api/withdrawals/request` with deterministic idempotency.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
} from 'react';
import './withdrawalForm.css';
import {
  MIN_WITHDRAWAL_MICROS,
  MIN_WITHDRAWAL_USDT,
  WITHDRAWAL_ASSET,
  WithdrawalModuleError,
  formatMicrosAsUsdt,
  formatWithdrawalFaultCode,
  isWithdrawalModuleError,
  usdtToMicros,
  validateDestinationAddress,
  type WithdrawalAddressType,
  type WithdrawalConfigResponseDto,
  type WithdrawalNetworkConfig,
  type WithdrawalQuoteResponseDto,
  type WithdrawalRequest,
} from '../../types/withdrawal.ts';
import {
  validateClientWithdrawalSession,
  type ClientWithdrawalAuthSession,
} from '../../services/withdrawals/withdrawalAuthGuard.ts';
import {
  fetchWithdrawalConfig,
  requestMaxWithdrawalQuote,
  requestWithdrawalQuote,
  type WithdrawalApiClientOptions,
} from '../../services/withdrawals/withdrawalConfigQuoteClient.ts';
import {
  createWithdrawalIdempotencyKey,
  submitWithdrawalRequest,
  type SubmitWithdrawalRequestResponseDto,
} from '../../services/withdrawals/withdrawalRequestClient.ts';

// ============================================================================
// 1. W05 FAULT CODES & VALIDATION CONTRACTS (`W05-FORM_UI-*`)
// ============================================================================

export type WithdrawalFormFaultCodeKey =
  | 'NETWORK_REQUIRED'
  | 'ADDRESS_REQUIRED'
  | 'INVALID_DESTINATION_ADDRESS'
  | 'AMOUNT_REQUIRED'
  | 'MINIMUM_WITHDRAWAL_NOT_MET'
  | 'INSUFFICIENT_AVAILABLE_BALANCE'
  | 'SUBMIT_ALREADY_IN_FLIGHT';

export interface WithdrawalFormFieldValidation {
  valid: boolean;
  faultCode?: string;
  code?: WithdrawalFormFaultCodeKey | string;
  field?: 'networkId' | 'destinationAddress' | 'amountUsdt' | 'balance' | 'submit';
  message?: string;
  requestedAmountMicros?: number;
  normalizedAddress?: string;
}

export interface ValidateWithdrawalFormInputParams {
  selectedNetwork: WithdrawalNetworkConfig | null | undefined;
  destinationAddress: string;
  amountUsdtInput: string;
  availableBalanceMicros: number;
  activeQuote?: WithdrawalQuoteResponseDto | null;
}

/**
 * Pure UX & financial validator for the W05 Client Form.
 * Emits traceable `W05-FORM_UI-*` fault codes before dispatching to W04.
 */
export function validateWithdrawalFormInput(
  params: ValidateWithdrawalFormInputParams,
): WithdrawalFormFieldValidation {
  const {
    selectedNetwork,
    destinationAddress,
    amountUsdtInput,
    availableBalanceMicros,
    activeQuote,
  } = params;

  if (!selectedNetwork || !selectedNetwork.enabled || selectedNetwork.asset !== WITHDRAWAL_ASSET) {
    return {
      valid: false,
      field: 'networkId',
      code: 'NETWORK_REQUIRED',
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'NETWORK_REQUIRED', 400),
      message: 'Selecciona una red USDT habilitada para continuar.',
    };
  }

  const trimmedAddress = typeof destinationAddress === 'string' ? destinationAddress.trim() : '';
  if (!trimmedAddress) {
    return {
      valid: false,
      field: 'destinationAddress',
      code: 'ADDRESS_REQUIRED',
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'ADDRESS_REQUIRED', 400),
      message: 'Ingresa la dirección de billetera donde recibirás tus USDT.',
    };
  }

  const addressCheck = validateDestinationAddress(trimmedAddress, selectedNetwork.addressType);
  if (!addressCheck.valid) {
    return {
      valid: false,
      field: 'destinationAddress',
      code: 'INVALID_DESTINATION_ADDRESS',
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'INVALID_DESTINATION_ADDRESS', 422),
      message:
        addressCheck.reason ??
        `Dirección inválida para la red ${selectedNetwork.network} (${selectedNetwork.addressType}).`,
    };
  }

  const trimmedAmount = typeof amountUsdtInput === 'string' ? amountUsdtInput.trim() : '';
  if (!trimmedAmount) {
    return {
      valid: false,
      field: 'amountUsdt',
      code: 'AMOUNT_REQUIRED',
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'AMOUNT_REQUIRED', 400),
      message: 'Ingresa el monto en USDT que deseas retirar.',
    };
  }

  let requestedAmountMicros = 0;
  try {
    requestedAmountMicros = usdtToMicros(trimmedAmount);
  } catch {
    return {
      valid: false,
      field: 'amountUsdt',
      code: 'AMOUNT_REQUIRED',
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'AMOUNT_REQUIRED', 400),
      message: 'El monto debe ser un número positivo con hasta 6 decimales.',
    };
  }

  const minimumMicros = Math.max(
    selectedNetwork.minimumWithdrawalMicros,
    MIN_WITHDRAWAL_MICROS,
  );
  if (requestedAmountMicros < minimumMicros) {
    return {
      valid: false,
      field: 'amountUsdt',
      code: 'MINIMUM_WITHDRAWAL_NOT_MET',
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'MINIMUM_WITHDRAWAL_NOT_MET', 422),
      message: `El retiro mínimo para ${selectedNetwork.network} es de ${formatMicrosAsUsdt(minimumMicros)} USDT.`,
      requestedAmountMicros,
      normalizedAddress: addressCheck.normalizedAddress,
    };
  }

  const totalDebitToCheck =
    activeQuote &&
    activeQuote.networkId === selectedNetwork.id &&
    activeQuote.requestedAmountMicros === requestedAmountMicros
      ? activeQuote.totalDebitMicros
      : requestedAmountMicros +
        selectedNetwork.feePolicy.networkFeeMicros +
        selectedNetwork.feePolicy.conversionFeeMicros;

  if (totalDebitToCheck > availableBalanceMicros) {
    return {
      valid: false,
      field: 'balance',
      code: 'INSUFFICIENT_AVAILABLE_BALANCE',
      faultCode: formatWithdrawalFaultCode(
        'W05',
        'FORM_UI',
        'INSUFFICIENT_AVAILABLE_BALANCE',
        422,
      ),
      message:
        'Saldo disponible insuficiente para cubrir el monto solicitado más las comisiones de red y plataforma.',
      requestedAmountMicros,
      normalizedAddress: addressCheck.normalizedAddress,
    };
  }

  return {
    valid: true,
    requestedAmountMicros,
    normalizedAddress: addressCheck.normalizedAddress,
  };
}

// ============================================================================
// 2. HEADLESS CONTROLLER FOR E2E & REACT STATE ORCHESTRATION
// ============================================================================

export interface WithdrawalFormSnapshot {
  isLoadingConfig: boolean;
  isQuoting: boolean;
  isSubmitting: boolean;
  config: WithdrawalConfigResponseDto | null;
  enabledNetworks: WithdrawalNetworkConfig[];
  selectedNetworkId: string;
  selectedNetwork: WithdrawalNetworkConfig | null;
  destinationAddress: string;
  addressPrefilledFromWallet: boolean;
  amountUsdtInput: string;
  quote: WithdrawalQuoteResponseDto | null;
  activeIdempotencyKey: string | null;
  error: {
    faultCode: string;
    code: string;
    message: string;
    field?: string;
  } | null;
  lastSubmittedWithdrawal: WithdrawalRequest | null;
  lastSubmitResponse: SubmitWithdrawalRequestResponseDto | null;
}

export interface CreateWithdrawalFormControllerOptions {
  session: ClientWithdrawalAuthSession | null | undefined;
  apiOptions?: WithdrawalApiClientOptions;
  connectedWalletAddress?: string | null;
  initialConfig?: WithdrawalConfigResponseDto | null;
  onStateChange?: (snapshot: WithdrawalFormSnapshot) => void;
  onWithdrawalSuccess?: (
    response: SubmitWithdrawalRequestResponseDto,
    refreshedConfig: WithdrawalConfigResponseDto | null,
  ) => void;
}

export interface WithdrawalFormController {
  getSnapshot(): WithdrawalFormSnapshot;
  loadConfig(): Promise<WithdrawalConfigResponseDto>;
  selectNetwork(networkId: string): Promise<WithdrawalQuoteResponseDto | null>;
  setDestinationAddress(address: string, fromConnectedWallet?: boolean): void;
  prefillConnectedWallet(walletAddress?: string): void;
  setAmountUsdt(amountUsdtInput: string): Promise<WithdrawalQuoteResponseDto | null>;
  applyMaxQuote(): Promise<WithdrawalQuoteResponseDto>;
  submit(): Promise<SubmitWithdrawalRequestResponseDto>;
}

function resolveEnabledUsdtNetworks(
  config: WithdrawalConfigResponseDto | null | undefined,
): WithdrawalNetworkConfig[] {
  if (!config || !Array.isArray(config.networks)) {
    return [];
  }
  return config.networks.filter(
    (net) => net && net.enabled === true && net.asset === WITHDRAWAL_ASSET,
  );
}

export function createWithdrawalFormController(
  options: CreateWithdrawalFormControllerOptions,
): WithdrawalFormController {
  const initialNetworks = resolveEnabledUsdtNetworks(options.initialConfig);
  const initialSelectedNet = initialNetworks[0] ?? null;

  let intentCounter = 1;
  let intentSignature = '';
  let currentIdempotencyKey: string | null = null;

  let state: WithdrawalFormSnapshot = {
    isLoadingConfig: false,
    isQuoting: false,
    isSubmitting: false,
    config: options.initialConfig ?? null,
    enabledNetworks: initialNetworks,
    selectedNetworkId: initialSelectedNet?.id ?? '',
    selectedNetwork: initialSelectedNet,
    destinationAddress: '',
    addressPrefilledFromWallet: false,
    amountUsdtInput: '',
    quote: null,
    activeIdempotencyKey: null,
    error: null,
    lastSubmittedWithdrawal: null,
    lastSubmitResponse: null,
  };

  const notify = () => {
    options.onStateChange?.({ ...state });
  };

  const updateState = (patch: Partial<WithdrawalFormSnapshot>) => {
    state = { ...state, ...patch };
    notify();
  };

  const ensureIdempotencyKeyForIntent = (
    uid: string,
    networkId: string,
    destinationAddress: string,
    requestedAmountMicros: number,
  ): string => {
    const sig = `${uid}|${networkId}|${destinationAddress.trim()}|${requestedAmountMicros}|${intentCounter}`;
    if (intentSignature !== sig || !currentIdempotencyKey) {
      intentSignature = sig;
      currentIdempotencyKey = createWithdrawalIdempotencyKey(
        uid,
        networkId,
        requestedAmountMicros,
        `w05_${intentCounter}`,
      );
      state = { ...state, activeIdempotencyKey: currentIdempotencyKey };
    }
    return currentIdempotencyKey;
  };

  const rotateIntentNonce = () => {
    intentCounter += 1;
    intentSignature = '';
    currentIdempotencyKey = null;
    state = { ...state, activeIdempotencyKey: null };
  };

  const mapUnknownErrorToFormError = (
    err: unknown,
    fallbackCode: WithdrawalFormFaultCodeKey = 'AMOUNT_REQUIRED',
  ): { faultCode: string; code: string; message: string } => {
    if (isWithdrawalModuleError(err)) {
      return {
        faultCode: err.faultCode,
        code: err.code,
        message: err.message.replace(/^\[[^\]]+\]\s*[A-Z0-9_]+:\s*/i, '').trim(),
      };
    }
    const msg = err instanceof Error ? err.message : 'Error inesperado en el formulario de retiro.';
    return {
      faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', fallbackCode, 400),
      code: fallbackCode,
      message: msg,
    };
  };

  return {
    getSnapshot(): WithdrawalFormSnapshot {
      return { ...state };
    },

    async loadConfig(): Promise<WithdrawalConfigResponseDto> {
      updateState({ isLoadingConfig: true, error: null });
      try {
        const config = await fetchWithdrawalConfig(options.session, options.apiOptions);
        const enabledNetworks = resolveEnabledUsdtNetworks(config);
        const preservedNetwork =
          enabledNetworks.find((net) => net.id === state.selectedNetworkId) ??
          enabledNetworks[0] ??
          null;

        updateState({
          isLoadingConfig: false,
          config,
          enabledNetworks,
          selectedNetworkId: preservedNetwork?.id ?? '',
          selectedNetwork: preservedNetwork,
        });
        return config;
      } catch (err) {
        const mapped = mapUnknownErrorToFormError(err, 'NETWORK_REQUIRED');
        updateState({
          isLoadingConfig: false,
          error: mapped,
        });
        throw err;
      }
    },

    async selectNetwork(networkId: string): Promise<WithdrawalQuoteResponseDto | null> {
      const target = state.enabledNetworks.find((net) => net.id === networkId) ?? null;
      if (!target) {
        const faultCode = formatWithdrawalFaultCode('W05', 'FORM_UI', 'NETWORK_REQUIRED', 400);
        updateState({
          error: {
            faultCode,
            code: 'NETWORK_REQUIRED',
            field: 'networkId',
            message: 'La red seleccionada no está habilitada en la configuración activa.',
          },
        });
        throw new WithdrawalModuleError({
          originTask: 'W05',
          originModule: 'FORM_UI',
          code: 'NETWORK_REQUIRED',
          httpStatus: 400,
          message: 'La red seleccionada no está habilitada en la configuración activa.',
        });
      }

      rotateIntentNonce();
      updateState({
        selectedNetworkId: target.id,
        selectedNetwork: target,
        quote: null,
        error: null,
      });

      const trimmedAmount = state.amountUsdtInput.trim();
      if (!trimmedAmount) {
        return null;
      }

      try {
        const micros = usdtToMicros(trimmedAmount);
        if (micros <= 0) {
          return null;
        }
        updateState({ isQuoting: true });
        const quote = await requestWithdrawalQuote(
          options.session,
          {
            networkId: target.id,
            mode: 'EXACT_AMOUNT',
            requestedAmountMicros: micros,
            ...(state.destinationAddress.trim()
              ? { destinationAddress: state.destinationAddress.trim() }
              : {}),
          },
          options.apiOptions,
        );
        updateState({
          isQuoting: false,
          quote,
          error:
            quote.validationFaultCode && quote.validationMessage
              ? {
                  faultCode: quote.validationFaultCode,
                  code: quote.meetsMinimum
                    ? 'INSUFFICIENT_AVAILABLE_BALANCE'
                    : 'MINIMUM_WITHDRAWAL_NOT_MET',
                  field: quote.meetsMinimum ? 'balance' : 'amountUsdt',
                  message: quote.validationMessage,
                }
              : null,
        });
        return quote;
      } catch (err) {
        const mapped = mapUnknownErrorToFormError(err, 'AMOUNT_REQUIRED');
        updateState({ isQuoting: false, error: mapped });
        return null;
      }
    },

    setDestinationAddress(address: string, fromConnectedWallet = false): void {
      const nextAddress = typeof address === 'string' ? address : '';
      if (nextAddress.trim() !== state.destinationAddress.trim()) {
        rotateIntentNonce();
      }

      let addressError: WithdrawalFormSnapshot['error'] = null;
      if (nextAddress.trim() && state.selectedNetwork) {
        const check = validateDestinationAddress(
          nextAddress.trim(),
          state.selectedNetwork.addressType,
        );
        if (!check.valid) {
          addressError = {
            faultCode: formatWithdrawalFaultCode(
              'W05',
              'FORM_UI',
              'INVALID_DESTINATION_ADDRESS',
              422,
            ),
            code: 'INVALID_DESTINATION_ADDRESS',
            field: 'destinationAddress',
            message:
              check.reason ??
              `Dirección inválida para ${state.selectedNetwork.network}.`,
          };
        }
      }

      updateState({
        destinationAddress: nextAddress,
        addressPrefilledFromWallet: fromConnectedWallet,
        error: addressError,
      });
    },

    prefillConnectedWallet(walletAddress?: string): void {
      const candidate =
        typeof walletAddress === 'string' && walletAddress.trim()
          ? walletAddress.trim()
          : typeof options.connectedWalletAddress === 'string'
            ? options.connectedWalletAddress.trim()
            : '';
      if (!candidate) {
        return;
      }
      this.setDestinationAddress(candidate, true);
    },

    async setAmountUsdt(amountUsdtInput: string): Promise<WithdrawalQuoteResponseDto | null> {
      const cleanInput = typeof amountUsdtInput === 'string' ? amountUsdtInput : '';
      if (cleanInput.trim() !== state.amountUsdtInput.trim()) {
        rotateIntentNonce();
      }

      if (!cleanInput.trim()) {
        updateState({
          amountUsdtInput: cleanInput,
          quote: null,
          error: null,
        });
        return null;
      }

      let requestedAmountMicros = 0;
      try {
        requestedAmountMicros = usdtToMicros(cleanInput.trim());
      } catch {
        updateState({
          amountUsdtInput: cleanInput,
          quote: null,
          error: {
            faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'AMOUNT_REQUIRED', 400),
            code: 'AMOUNT_REQUIRED',
            field: 'amountUsdt',
            message: 'Ingresa un monto válido en USDT con hasta 6 decimales.',
          },
        });
        return null;
      }

      if (!state.selectedNetwork) {
        updateState({
          amountUsdtInput: cleanInput,
          quote: null,
          error: {
            faultCode: formatWithdrawalFaultCode('W05', 'FORM_UI', 'NETWORK_REQUIRED', 400),
            code: 'NETWORK_REQUIRED',
            field: 'networkId',
            message: 'Selecciona una red USDT habilitada antes de cotizar.',
          },
        });
        return null;
      }

      updateState({
        amountUsdtInput: cleanInput,
        isQuoting: true,
        error: null,
      });

      try {
        const quote = await requestWithdrawalQuote(
          options.session,
          {
            networkId: state.selectedNetwork.id,
            mode: 'EXACT_AMOUNT',
            requestedAmountMicros,
            ...(state.destinationAddress.trim()
              ? { destinationAddress: state.destinationAddress.trim() }
              : {}),
          },
          options.apiOptions,
        );

        let quoteError: WithdrawalFormSnapshot['error'] = null;
        if (!quote.meetsMinimum) {
          quoteError = {
            faultCode: formatWithdrawalFaultCode(
              'W05',
              'FORM_UI',
              'MINIMUM_WITHDRAWAL_NOT_MET',
              422,
            ),
            code: 'MINIMUM_WITHDRAWAL_NOT_MET',
            field: 'amountUsdt',
            message:
              quote.validationMessage ??
              `El retiro mínimo es de ${MIN_WITHDRAWAL_USDT}.00 USDT.`,
          };
        } else if (!quote.withinAvailableBalance) {
          quoteError = {
            faultCode: formatWithdrawalFaultCode(
              'W05',
              'FORM_UI',
              'INSUFFICIENT_AVAILABLE_BALANCE',
              422,
            ),
            code: 'INSUFFICIENT_AVAILABLE_BALANCE',
            field: 'balance',
            message:
              quote.validationMessage ??
              'Saldo disponible insuficiente para cubrir el monto más las comisiones.',
          };
        }

        updateState({
          isQuoting: false,
          quote,
          error: quoteError,
        });
        return quote;
      } catch (err) {
        const mapped = mapUnknownErrorToFormError(err, 'AMOUNT_REQUIRED');
        updateState({
          isQuoting: false,
          error: mapped,
        });
        return null;
      }
    },

    async applyMaxQuote(): Promise<WithdrawalQuoteResponseDto> {
      if (!state.selectedNetwork) {
        const err = new WithdrawalModuleError({
          originTask: 'W05',
          originModule: 'FORM_UI',
          code: 'NETWORK_REQUIRED',
          httpStatus: 400,
          message: 'Selecciona una red USDT habilitada para calcular el monto máximo.',
        });
        updateState({
          error: {
            faultCode: err.faultCode,
            code: err.code,
            field: 'networkId',
            message: err.message,
          },
        });
        throw err;
      }

      rotateIntentNonce();
      updateState({ isQuoting: true, error: null });

      try {
        const quote = await requestMaxWithdrawalQuote(
          options.session,
          state.selectedNetwork.id,
          state.destinationAddress.trim() || undefined,
          options.apiOptions,
        );

        const formattedMax = formatMicrosAsUsdt(quote.requestedAmountMicros, 2);
        let maxError: WithdrawalFormSnapshot['error'] = null;
        if (!quote.meetsMinimum) {
          maxError = {
            faultCode: formatWithdrawalFaultCode(
              'W05',
              'FORM_UI',
              'MINIMUM_WITHDRAWAL_NOT_MET',
              422,
            ),
            code: 'MINIMUM_WITHDRAWAL_NOT_MET',
            field: 'balance',
            message:
              quote.validationMessage ??
              `Tu saldo disponible descontando comisiones no alcanza el mínimo de ${MIN_WITHDRAWAL_USDT}.00 USDT.`,
          };
        }

        updateState({
          isQuoting: false,
          amountUsdtInput: formattedMax,
          quote,
          error: maxError,
        });
        return quote;
      } catch (err) {
        const mapped = mapUnknownErrorToFormError(err, 'INSUFFICIENT_AVAILABLE_BALANCE');
        updateState({
          isQuoting: false,
          error: mapped,
        });
        throw err;
      }
    },

    async submit(): Promise<SubmitWithdrawalRequestResponseDto> {
      if (state.isSubmitting) {
        throw new WithdrawalModuleError({
          originTask: 'W05',
          originModule: 'FORM_UI',
          code: 'SUBMIT_ALREADY_IN_FLIGHT',
          httpStatus: 409,
          message: 'Ya hay una solicitud de retiro en proceso de envío. Evita el doble clic.',
        });
      }

      const sessionCheck = validateClientWithdrawalSession(options.session);
      if (!sessionCheck.allowed) {
        const authErr = new WithdrawalModuleError({
          originTask: 'W02',
          originModule: 'CLIENT_GUARD',
          code: sessionCheck.code,
          httpStatus: sessionCheck.code === 'ANONYMOUS_FORBIDDEN' ? 403 : 401,
          message: sessionCheck.message,
        });
        updateState({
          error: {
            faultCode: authErr.faultCode,
            code: authErr.code,
            message: authErr.message,
          },
        });
        throw authErr;
      }

      const availableBalanceMicros = state.config?.userBalance.availableBalanceMicros ?? 0;
      const validation = validateWithdrawalFormInput({
        selectedNetwork: state.selectedNetwork,
        destinationAddress: state.destinationAddress,
        amountUsdtInput: state.amountUsdtInput,
        availableBalanceMicros,
        activeQuote: state.quote,
      });

      if (!validation.valid || !state.selectedNetwork || !validation.requestedAmountMicros) {
        const code = (validation.code ?? 'AMOUNT_REQUIRED') as WithdrawalFormFaultCodeKey;
        const status =
          code === 'NETWORK_REQUIRED' ||
          code === 'ADDRESS_REQUIRED' ||
          code === 'AMOUNT_REQUIRED'
            ? 400
            : 422;
        const formErr = new WithdrawalModuleError({
          originTask: 'W05',
          originModule: 'FORM_UI',
          code,
          httpStatus: status,
          message: validation.message ?? 'Revisa los datos del formulario antes de enviar.',
        });
        updateState({
          error: {
            faultCode: validation.faultCode ?? formErr.faultCode,
            code,
            field: validation.field,
            message: validation.message ?? formErr.message,
          },
        });
        throw formErr;
      }

      const selectedNetwork = state.selectedNetwork;
      const requestedAmountMicros = validation.requestedAmountMicros;
      const normalizedDestinationAddress =
        validation.normalizedAddress ?? state.destinationAddress.trim();

      const idempotencyKey = ensureIdempotencyKeyForIntent(
        sessionCheck.uid,
        selectedNetwork.id,
        normalizedDestinationAddress,
        requestedAmountMicros,
      );

      updateState({ isSubmitting: true, error: null });

      try {
        // Ensure we have an authoritative quote matching the exact amount before locking funds
        if (
          !state.quote ||
          state.quote.networkId !== selectedNetwork.id ||
          state.quote.requestedAmountMicros !== requestedAmountMicros
        ) {
          const freshQuote = await requestWithdrawalQuote(
            options.session,
            {
              networkId: selectedNetwork.id,
              mode: 'EXACT_AMOUNT',
              requestedAmountMicros,
              destinationAddress: normalizedDestinationAddress,
            },
            options.apiOptions,
          );
          if (!freshQuote.meetsMinimum || !freshQuote.withinAvailableBalance) {
            const code: WithdrawalFormFaultCodeKey = !freshQuote.meetsMinimum
              ? 'MINIMUM_WITHDRAWAL_NOT_MET'
              : 'INSUFFICIENT_AVAILABLE_BALANCE';
            throw new WithdrawalModuleError({
              originTask: 'W05',
              originModule: 'FORM_UI',
              code,
              httpStatus: 422,
              message:
                freshQuote.validationMessage ??
                'La cotización autoritativa indica que no se cumplen las condiciones de saldo o mínimo.',
            });
          }
          state = { ...state, quote: freshQuote };
        }

        const response = await submitWithdrawalRequest(
          options.session,
          {
            networkId: selectedNetwork.id,
            destinationAddress: normalizedDestinationAddress,
            requestedAmountMicros,
            idempotencyKey,
          },
          options.apiOptions,
        );

        // Authoritative refresh from backend (`GET /api/withdrawals/config`) — NEVER decrement locally by formula
        let refreshedConfig: WithdrawalConfigResponseDto | null = null;
        try {
          refreshedConfig = await fetchWithdrawalConfig(options.session, options.apiOptions);
        } catch {
          // If `/config` refresh fails transiently, use the authoritative `userBalance` returned by the W04 transaction
          if (state.config) {
            refreshedConfig = {
              ...state.config,
              userBalance: {
                uid: response.userBalance.uid,
                availableBalanceMicros: response.userBalance.availableBalanceMicros,
                lockedBalanceMicros: response.userBalance.lockedBalanceMicros,
                totalWithdrawnMicros: response.userBalance.totalWithdrawnMicros,
                availableBalanceUsdt: response.syncedUserBalanceUsdt,
                membershipTier: response.userBalance.membershipTier,
              },
            };
          }
        }

        rotateIntentNonce();
        updateState({
          isSubmitting: false,
          config: refreshedConfig ?? state.config,
          amountUsdtInput: '',
          quote: null,
          error: null,
          lastSubmittedWithdrawal: response.withdrawalRequest,
          lastSubmitResponse: response,
        });

        options.onWithdrawalSuccess?.(response, refreshedConfig);
        return response;
      } catch (err) {
        const mapped = mapUnknownErrorToFormError(err, 'INSUFFICIENT_AVAILABLE_BALANCE');
        updateState({
          isSubmitting: false,
          error: mapped,
        });
        throw err;
      }
    },
  };
}

// ============================================================================
// 3. REACT COMPONENT `<WithdrawalForm />` (`SCRUM-280`)
// ============================================================================

export interface WithdrawalFormProps {
  session: ClientWithdrawalAuthSession | null | undefined;
  apiOptions?: WithdrawalApiClientOptions;
  connectedWalletAddress?: string | null;
  initialConfig?: WithdrawalConfigResponseDto | null;
  autoLoadConfig?: boolean;
  onWithdrawalSuccess?: (
    response: SubmitWithdrawalRequestResponseDto,
    refreshedConfig: WithdrawalConfigResponseDto | null,
  ) => void;
}

function addressPlaceholderByType(addressType?: WithdrawalAddressType): string {
  switch (addressType) {
    case 'TRON':
      return 'Ej. T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb (TRC-20 Base58)';
    case 'SOLANA':
      return 'Ej. 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV (SPL Base58)';
    case 'EVM':
    default:
      return 'Ej. 0x71C7656EC7ab88b098defB751B7401B5f6d8976F (EVM 0x...)';
  }
}

function shortenWalletAddress(address: string): string {
  const clean = address.trim();
  if (clean.length <= 14) {
    return clean;
  }
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export function WithdrawalForm({
  session,
  apiOptions,
  connectedWalletAddress,
  initialConfig = null,
  autoLoadConfig = true,
  onWithdrawalSuccess,
}: WithdrawalFormProps): ReactElement {
  const addressInputId = useId();
  const amountInputId = useId();

  const controllerRef = useRef<WithdrawalFormController | null>(null);
  const [snapshot, setSnapshot] = useState<WithdrawalFormSnapshot>(() => {
    const ctrl = createWithdrawalFormController({
      session,
      apiOptions,
      connectedWalletAddress,
      initialConfig,
      onWithdrawalSuccess,
    });
    controllerRef.current = ctrl;
    return ctrl.getSnapshot();
  });

  useEffect(() => {
    const ctrl = createWithdrawalFormController({
      session,
      apiOptions,
      connectedWalletAddress,
      initialConfig: snapshot.config ?? initialConfig,
      onStateChange: (next) => setSnapshot(next),
      onWithdrawalSuccess,
    });
    controllerRef.current = ctrl;
    setSnapshot(ctrl.getSnapshot());

    if (autoLoadConfig && !initialConfig && session?.uid && session?.idToken) {
      void ctrl.loadConfig().catch(() => {
        /* captured in snapshot.error */
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uid, session?.idToken]);

  const handleSelectNetwork = useCallback(async (networkId: string) => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.selectNetwork(networkId);
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleAddressChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    controllerRef.current?.setDestinationAddress(event.target.value, false);
  }, []);

  const handlePrefillConnectedWallet = useCallback(() => {
    if (!connectedWalletAddress) return;
    controllerRef.current?.prefillConnectedWallet(connectedWalletAddress);
  }, [connectedWalletAddress]);

  const handleAmountChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (!controllerRef.current) return;
    await controllerRef.current.setAmountUsdt(event.target.value);
  }, []);

  const handleMaxClick = useCallback(async () => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.applyMaxQuote();
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleRefreshConfig = useCallback(async () => {
    if (!controllerRef.current) return;
    try {
      await controllerRef.current.loadConfig();
    } catch {
      /* captured in snapshot.error */
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!controllerRef.current) return;
      try {
        await controllerRef.current.submit();
      } catch {
        /* captured in snapshot.error */
      }
    },
    [],
  );

  const availableMicros = snapshot.config?.userBalance.availableBalanceMicros ?? 0;
  const lockedMicros = snapshot.config?.userBalance.lockedBalanceMicros ?? 0;
  const slaLabel =
    snapshot.config?.slaPolicy.displayLabel ??
    'Hasta 24 horas (Estándar sin membresía)';
  const membershipTier = snapshot.config?.userBalance.membershipTier ?? 'NONE';
  const selectedNet = snapshot.selectedNetwork;
  const quote = snapshot.quote;

  const requestedMicrosDisplay = quote?.requestedAmountMicros ?? 0;
  const networkFeeMicrosDisplay =
    quote?.networkFeeMicros ?? selectedNet?.feePolicy.networkFeeMicros ?? 0;
  const platformFeeMicrosDisplay = quote?.platformFeeMicros ?? 0;
  const conversionFeeMicrosDisplay =
    quote?.conversionFeeMicros ?? selectedNet?.feePolicy.conversionFeeMicros ?? 0;
  const totalFeesMicrosDisplay =
    quote?.totalFeesMicros ?? networkFeeMicrosDisplay + platformFeeMicrosDisplay + conversionFeeMicrosDisplay;
  const totalDebitMicrosDisplay = quote?.totalDebitMicros ?? 0;
  const netAmountMicrosDisplay = quote?.netAmountMicros ?? 0;
  const requiredConfirmationsDisplay =
    quote?.requiredConfirmations ?? selectedNet?.requiredConfirmations ?? 15;

  return (
    <section
      className="wth-form-shell"
      aria-label="Solicitud de Retiro USDT"
      data-testid="withdrawal-form-shell"
    >
      {/* Top Authoritative Balance & SLA Header */}
      <header className="wth-header-strip">
        <div className="wth-header-brand">
          <div className="wth-kicker-row">
            <span className="wth-asset-pill" data-testid="withdrawal-asset-pill">
              <span className="wth-live-dot" aria-hidden="true" />
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8 9h8M12 9v8" />
              </svg>
              {WITHDRAWAL_ASSET} · Retiro Directo
            </span>
            <span className="wth-sla-badge wth-tabular-mono" data-testid="withdrawal-sla-badge">
              Prioridad {membershipTier}: {slaLabel}
            </span>
          </div>
          <h2 className="wth-header-title">Retirar Fondos Disponibles en USDT</h2>
          <p className="wth-header-subtitle">
            Reserva atómica inmediata desde tu saldo disponible. Las comisiones y el monto neto se calculan de forma autoritativa por red.
          </p>
        </div>

        <div className="wth-balance-metrics">
          <div
            className="wth-balance-block wth-balance-block--available"
            data-testid="withdrawal-available-balance-box"
          >
            <span className="wth-balance-label">Saldo Disponible</span>
            <span className="wth-balance-value wth-balance-value--available wth-tabular-mono">
              {snapshot.isLoadingConfig ? '---.--' : formatMicrosAsUsdt(availableMicros, 2)}
              <span className="wth-balance-unit">{WITHDRAWAL_ASSET}</span>
            </span>
          </div>

          <div className="wth-balance-block" data-testid="withdrawal-locked-balance-box">
            <span className="wth-balance-label">En Retiros Abiertos (Locked)</span>
            <span className="wth-balance-value wth-tabular-mono">
              {snapshot.isLoadingConfig ? '---.--' : formatMicrosAsUsdt(lockedMicros, 2)}
              <span className="wth-balance-unit">{WITHDRAWAL_ASSET}</span>
            </span>
          </div>

          <button
            type="button"
            className="wth-btn-refresh"
            onClick={handleRefreshConfig}
            disabled={snapshot.isLoadingConfig || snapshot.isSubmitting}
            data-testid="withdrawal-refresh-config-btn"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            </svg>
            Actualizar
          </button>
        </div>
      </header>

      {/* Main Asymmetric 2-Column Form & Quote Receipt */}
      <form className="wth-split-grid" onSubmit={handleSubmit} noValidate>
        {/* Left Column: Network, Destination Wallet & Amount */}
        <div className="wth-panel">
          <div className="wth-section-header">
            <div className="wth-section-title-group">
              <span className="wth-step-chip wth-tabular-mono">01 / ENVÍO</span>
              <h3 className="wth-section-title">Parámetros de Envío On-Chain</h3>
            </div>
            <span className="wth-field-hint wth-tabular-mono">
              Mínimo canónico: {MIN_WITHDRAWAL_USDT}.00 {WITHDRAWAL_ASSET}
            </span>
          </div>

          {/* Dynamic USDT Network Selector */}
          <div className="wth-field-group">
            <div className="wth-field-label-row">
              <label className="wth-field-label">Red de Destino ({WITHDRAWAL_ASSET})</label>
              <span className="wth-field-hint wth-tabular-mono">
                {snapshot.enabledNetworks.length} redes habilitadas
              </span>
            </div>

            {snapshot.isLoadingConfig && snapshot.enabledNetworks.length === 0 ? (
              <div className="wth-skeleton-grid" aria-busy="true">
                <div className="wth-skeleton-line" />
                <div className="wth-skeleton-line" />
              </div>
            ) : (
              <div
                className="wth-network-grid"
                role="radiogroup"
                aria-label="Redes USDT habilitadas"
                data-testid="withdrawal-network-grid"
              >
                {snapshot.enabledNetworks.map((net) => {
                  const isSelected = net.id === snapshot.selectedNetworkId;
                  return (
                    <button
                      key={net.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={snapshot.isSubmitting}
                      className={`wth-network-pill${isSelected ? ' wth-network-pill--selected' : ''}`}
                      onClick={() => void handleSelectNetwork(net.id)}
                      data-testid={`withdrawal-network-option-${net.id}`}
                    >
                      <div className="wth-network-pill-top">
                        <span className="wth-network-name-wrap">
                          <span className="wth-network-radio-dot" aria-hidden="true" />
                          <span className="wth-network-name">{net.network}</span>
                        </span>
                        <span className="wth-network-standard">{net.tokenStandard}</span>
                      </div>
                      <div className="wth-network-meta wth-tabular-mono">
                        <span>Fee red: {formatMicrosAsUsdt(net.feePolicy.networkFeeMicros, 2)} USDT</span>
                        <span>{net.requiredConfirmations} conf.</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Destination Wallet Input (Manual + Optional Connected Wallet Prefill) */}
          <div className="wth-field-group">
            <div className="wth-field-label-row">
              <label className="wth-field-label" htmlFor={addressInputId}>
                Dirección de Billetera Destino ({selectedNet?.addressType ?? 'EVM'})
              </label>

              {connectedWalletAddress && connectedWalletAddress.trim() && (
                <button
                  type="button"
                  className="wth-btn-prefill wth-tabular-mono"
                  onClick={handlePrefillConnectedWallet}
                  disabled={snapshot.isSubmitting}
                  data-testid="withdrawal-prefill-wallet-btn"
                >
                  Usar wallet conectada ({shortenWalletAddress(connectedWalletAddress)})
                </button>
              )}
            </div>

            <div
              className={`wth-input-wrapper${
                snapshot.error?.field === 'destinationAddress'
                  ? ' wth-input-wrapper--invalid'
                  : ''
              }`}
            >
              <input
                id={addressInputId}
                type="text"
                className="wth-input wth-tabular-mono"
                value={snapshot.destinationAddress}
                onChange={handleAddressChange}
                placeholder={addressPlaceholderByType(selectedNet?.addressType)}
                disabled={snapshot.isSubmitting}
                autoComplete="off"
                spellCheck={false}
                data-testid="withdrawal-address-input"
              />
            </div>

            <p className="wth-field-hint">
              Puedes escribir o pegar cualquier dirección {selectedNet?.tokenStandard ?? 'USDT'} compatible. No es obligatorio conectar tu billetera.
            </p>
          </div>

          {/* Amount Input + Authoritative MAX Button */}
          <div className="wth-field-group wth-field-group--last">
            <div className="wth-field-label-row">
              <label className="wth-field-label" htmlFor={amountInputId}>
                Monto Solicitado ({WITHDRAWAL_ASSET})
              </label>
              <span className="wth-field-hint wth-tabular-mono">
                Mínimo red:{' '}
                {formatMicrosAsUsdt(
                  selectedNet?.minimumWithdrawalMicros ?? MIN_WITHDRAWAL_MICROS,
                  2,
                )}{' '}
                {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div
              className={`wth-input-wrapper${
                snapshot.error?.field === 'amountUsdt' || snapshot.error?.field === 'balance'
                  ? ' wth-input-wrapper--invalid'
                  : ''
              }`}
            >
              <input
                id={amountInputId}
                type="text"
                inputMode="decimal"
                className="wth-input wth-input--amount wth-tabular-mono"
                value={snapshot.amountUsdtInput}
                onChange={(e) => void handleAmountChange(e)}
                placeholder="10.00"
                disabled={snapshot.isSubmitting}
                autoComplete="off"
                data-testid="withdrawal-amount-input"
              />
              <div className="wth-input-suffix-group">
                <span className="wth-asset-inline-tag">{WITHDRAWAL_ASSET}</span>
                <button
                  type="button"
                  className="wth-btn-max"
                  onClick={() => void handleMaxClick()}
                  disabled={snapshot.isSubmitting || snapshot.isLoadingConfig}
                  data-testid="withdrawal-max-btn"
                >
                  MAX
                </button>
              </div>
            </div>

            <p className="wth-field-hint">
              El botón MAX calcula en el servidor el mayor monto retirable cuyo débito total (monto + comisiones) no supere tu saldo disponible.
            </p>
          </div>

          {/* Traceable Fault Banner (`W05-FORM_UI-*`, `W03-QUOTE-*`, `W04-LOCK_TX-*`) */}
          {snapshot.error && (
            <div
              className="wth-field-error"
              role="alert"
              data-testid="withdrawal-error-banner"
            >
              <span className="wth-fault-code-tag" data-testid="withdrawal-fault-code">
                {snapshot.error.faultCode}
              </span>
              <span>{snapshot.error.message}</span>
            </div>
          )}
        </div>

        {/* Right Column: Live Authoritative Quote Breakdown & Submit */}
        <aside className="wth-panel wth-panel--receipt" aria-label="Resumen Autoritativo de Cotización">
          <div className="wth-section-header">
            <div className="wth-section-title-group">
              <span className="wth-step-chip wth-tabular-mono">02 / LIQUIDACIÓN</span>
              <h3 className="wth-section-title">Desglose Autoritativo de Retiro</h3>
            </div>
            <span className="wth-quote-standard-pill wth-tabular-mono">
              {snapshot.isQuoting ? 'Cotizando...' : selectedNet?.tokenStandard ?? 'USDT'}
            </span>
          </div>

          <div className="wth-quote-ledger" data-testid="withdrawal-quote-breakdown">
            <div className="wth-quote-row">
              <span className="wth-quote-label">Monto solicitado</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-requested-amount"
              >
                {formatMicrosAsUsdt(requestedMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-row">
              <span className="wth-quote-label">Comisión de red ({selectedNet?.networkCode ?? 'NET'})</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-network-fee"
              >
                {formatMicrosAsUsdt(networkFeeMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-row">
              <span className="wth-quote-label">Comisión operativa de plataforma (1%)</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-platform-fee"
              >
                {formatMicrosAsUsdt(platformFeeMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-row">
              <span className="wth-quote-label">Comisión de conversión</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-conversion-fee"
              >
                {formatMicrosAsUsdt(conversionFeeMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-row">
              <span className="wth-quote-label">Total comisiones</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-total-fees"
              >
                {formatMicrosAsUsdt(totalFeesMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-divider" />

            <div className="wth-quote-row wth-quote-row--highlight">
              <span className="wth-quote-label">Total a debitar (Available → Locked)</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-total-debit"
              >
                {formatMicrosAsUsdt(totalDebitMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-row wth-quote-row--highlight wth-quote-row--net-box">
              <span className="wth-quote-label wth-quote-label--net">Monto neto a recibir en destino</span>
              <span
                className="wth-quote-value wth-quote-value--net wth-tabular-mono"
                data-testid="quote-net-amount"
              >
                {formatMicrosAsUsdt(netAmountMicrosDisplay, 2)} {WITHDRAWAL_ASSET}
              </span>
            </div>

            <div className="wth-quote-divider" />

            <div className="wth-quote-row">
              <span className="wth-quote-label">Confirmaciones requeridas on-chain</span>
              <span
                className="wth-quote-value wth-tabular-mono"
                data-testid="quote-required-confirmations"
              >
                {requiredConfirmationsDisplay} bloques
              </span>
            </div>

            <div className="wth-quote-row">
              <span className="wth-quote-label">SLA / Ventana de procesamiento</span>
              <span className="wth-quote-value" data-testid="quote-sla-window">
                {slaLabel}
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="wth-btn-submit"
            disabled={snapshot.isSubmitting || snapshot.isLoadingConfig}
            data-testid="withdrawal-submit-btn"
          >
            <span>
              {snapshot.isSubmitting
                ? 'Reservando fondos atómicamente...'
                : `Solicitar Retiro en ${WITHDRAWAL_ASSET}`}
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>

          {snapshot.lastSubmittedWithdrawal && (
            <div
              className="wth-banner wth-banner--success"
              role="status"
              data-testid="withdrawal-success-banner"
            >
              <strong>Solicitud registrada ({snapshot.lastSubmittedWithdrawal.status})</strong>
              <div className="wth-tabular-mono">
                ID: {snapshot.lastSubmittedWithdrawal.id} · Neto:{' '}
                {formatMicrosAsUsdt(snapshot.lastSubmittedWithdrawal.netAmountMicros, 2)}{' '}
                {WITHDRAWAL_ASSET} · Débito bloqueado:{' '}
                {formatMicrosAsUsdt(snapshot.lastSubmittedWithdrawal.totalDebitMicros, 2)}{' '}
                {WITHDRAWAL_ASSET}
              </div>
            </div>
          )}
        </aside>
      </form>
    </section>
  );
}
