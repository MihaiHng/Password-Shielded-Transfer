# Password Shielded Transfer(PST) Platform

# About

The main functionality of this system is the addition of an extra security layer to tranfer operations

  A Password Shielded Transfer(PST) will require the following steps:

  - [Person A] sends an [amount] to [Person B] via the PST Platform
  - [Person A] sets up a [secure password] for the created transfer which is entered into the platform
  - [Person A] sends the [secure password] to Person B by a communication methodof its choice(whatsapp, email, phonecall etc.)
  - At this point there is a transfer created in the system, waiting to be unlocked and claimed with the [secure password] provided by [Person A]
  - [Person B] accesses the pending transfer and enters the [secure password] received from [Person A]
  - If the password entered by [Person B] matches the password which was set up by [Person A] the transfer will be unlocked for [Person B]
  - At this point [Person B] can claim [amount] sent by [Person A]

  The added layer of security provided by the [secure password] allows [Person A] to cancel the tranfer and claim back the [amount] at any point before the receiver [Person B] claims the [amount]

  function cancelTransfer(address receiver, uint256 transferIndex) external returns (bool) {
        bool canceledTransfer = false;

        (, s_senderTotalAmounts[msg.sender]) =
            s_senderTotalAmounts[msg.sender].trySub(s_receiverIndexedAmountToClaim[receiver][transferIndex]);

        s_receiverIndexedAmountToClaim[receiver][transferIndex] = 0;
        emit TransferCanceled(msg.sender, receiver, transferIndex);
        canceledTransfer = true;

        return canceledTransfer;
    }