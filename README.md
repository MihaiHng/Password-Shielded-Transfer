# Password Shielded Transfer(PST) 

# About

## Contract Address



## Description

The main functionality of this system is the addition of an extra security layer to tranfer operations

  A Password Shielded Transfer(PST) will require the following steps:

  - [Sender] sends an [amount] of [token] to [Receiver] by submitting the following data:
    -> [address] of [Receiver]
    -> [token] 
    -> [amount]
    -> [password] chosen by the [Sender] with min 7 characters
  - [Sender] sends the [password] to [Receiver] by a communication method of its choice outside the platform
  - At this point there is a pending transfer created in the system, waiting to be claimed
  - There are 3 main conditions in order for the [Receiver] to be able to claim the transfer
  - [Receiver] can claim the pending transfer if the [password] entered matches the [password] set by [Sender] and 
  if the claim is done before claim cooldown period has elapsed

## Properties

Additional properties:

   - The system charges a [fee] for every transfer. The [fee] is dynamically adjusted in relation with the amount sent  
   - The added layer of security provided by the [password] allows [Sender] to cancel the tranfer and claim back the [amount] at any point before the [Receiver] claims the [amount]
   - A transfer will have a limited availability period when it can be claimed, when this period has elapsed the transfer will expire and  [Sender] will be refunded
   - The system allows transfers of native ETH tokens as well as ERC20 tokens 
   - New ERC20 tokens can be approved and added by the owner
   - The system periodically removes inactive users from tracking
   - User transaction history is cleaned periodically 
   - Functions ready to be automatically called with Chainlink Automation:
    -> Refunding of expired transfers(custom-logic)
    -> Removing of inactive users(time-based)
    -> Cleaning of user history(time-based)

# Getting Started

## Requirements

- [git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
  - After installing run `git --version` and the result should be `git version x.x.x`
- [foundry](https://getfoundry.sh/)
  - After installing run `forge --version` and the result should be `forge x.x.x`

## Install Dependencies

```
forge install smartcontractkit/chainlink-brownie-contracts@1.3.0 --no-commit
forge install openzeppelin/openzeppelin-contracts@v5.1.0 --no-commit
forge install foundry-rs/forge-std@v1.9.4 --no-commit 
```

## Quickstart

```
git clone https://github.com/MihaiHng/Password-Shielded-Transfer 
cd Password-Shielded-Transfer
forge build
```

## Testing 

### Coverage Report

### Unit Tests

### Integration Tests

### Stateless - Fuzz Tests

### Statefull - Invariant Tests

## Frontend to follow

## Future Improvements 